local ESX = exports['es_extended']:getSharedObject()

-- ============================================
-- EXPORTS (Server-side API for external scripts)
-- ============================================

-- Helper to load inventory (reuses the cached system from main.lua)
local function getPlayerInv(identifier)
    local key = identifier .. ':player'
    -- loadInventory is defined in main.lua (same resource, shared env)
    return loadInventory(identifier, 'player')
end

-- Add item to player inventory (finds free space automatically)
-- Returns true on success, false if no space
local function AddItem(identifier, itemName, count, metadata)
    local def = Items[itemName]
    if not def then
        print('[cnbt-inventory] AddItem: unknown item ' .. tostring(itemName))
        return false
    end

    count = count or 1
    metadata = metadata or {}
    local inv = loadInventory(identifier, 'player')

    -- If stackable, try to stack onto existing items first
    if def.stackable then
        for _, item in ipairs(inv.items) do
            if item.name == itemName then
                local space = (def.maxStack or 1) - (item.count or 1)
                if space > 0 then
                    local toAdd = math.min(space, count)
                    item.count = (item.count or 1) + toAdd
                    count = count - toAdd
                    if count <= 0 then
                        markDirty(identifier, 'player')
                        return true
                    end
                end
            end
        end
    end

    -- Place remaining as new stacks
    while count > 0 do
        local stackSize = def.stackable and math.min(count, def.maxStack or 1) or 1
        local x, y, rotated = findFreePosition(inv.items, Config.PlayerCols, Config.PlayerRows, def.sizeX, def.sizeY)
        if not x then
            -- Also try backpack
            if inv.backpack then
                local bpDef = Config.Backpacks[inv.backpack.name]
                if bpDef then
                    x, y, rotated = findFreePosition(inv.backpack.items, bpDef.cols, bpDef.rows, def.sizeX, def.sizeY)
                    if x then
                        table.insert(inv.backpack.items, {
                            name = itemName,
                            x = x,
                            y = y,
                            rotated = rotated,
                            count = stackSize,
                            metadata = metadata,
                        })
                        count = count - stackSize
                        markDirty(identifier, 'player')
                        goto nextStack
                    end
                end
            end
            markDirty(identifier, 'player')
            return false -- no space
        end

        table.insert(inv.items, {
            name = itemName,
            x = x,
            y = y,
            rotated = rotated,
            count = stackSize,
            metadata = metadata,
        })
        count = count - stackSize
        markDirty(identifier, 'player')
        ::nextStack::
    end

    return true
end

-- Remove item from player inventory
-- Returns true on success
local function RemoveItem(identifier, itemName, count)
    count = count or 1
    local inv = loadInventory(identifier, 'player')

    local function removeFromGrid(gridItems)
        for i = #gridItems, 1, -1 do
            if gridItems[i].name == itemName and count > 0 then
                local item = gridItems[i]
                local toRemove = math.min(count, item.count or 1)
                item.count = (item.count or 1) - toRemove
                count = count - toRemove
                if item.count <= 0 then
                    table.remove(gridItems, i)
                end
            end
        end
    end

    removeFromGrid(inv.items)
    if count > 0 and inv.backpack then
        removeFromGrid(inv.backpack.items)
    end

    markDirty(identifier, 'player')
    return count <= 0
end

-- Get item count for a player
local function GetItemCount(identifier, itemName)
    local inv = loadInventory(identifier, 'player')
    local total = 0

    for _, item in ipairs(inv.items) do
        if item.name == itemName then
            total = total + (item.count or 1)
        end
    end

    if inv.backpack then
        for _, item in ipairs(inv.backpack.items) do
            if item.name == itemName then
                total = total + (item.count or 1)
            end
        end
    end

    return total
end

-- Check if player has item
local function HasItem(identifier, itemName, count)
    count = count or 1
    return GetItemCount(identifier, itemName) >= count
end

-- Get all items of a player (flat list)
local function GetInventory(identifier)
    local inv = loadInventory(identifier, 'player')
    local result = {}
    for _, item in ipairs(inv.items) do
        table.insert(result, {
            name = item.name,
            count = item.count or 1,
            metadata = item.metadata or {},
        })
    end
    if inv.backpack then
        for _, item in ipairs(inv.backpack.items) do
            table.insert(result, {
                name = item.name,
                count = item.count or 1,
                metadata = item.metadata or {},
            })
        end
    end
    return result
end

-- Get total weight
local function GetWeight(identifier)
    local inv = loadInventory(identifier, 'player')
    local total = 0
    for _, item in ipairs(inv.items) do
        local def = Items[item.name]
        if def then total = total + def.weight * (item.count or 1) end
    end
    if inv.backpack then
        local bpDef = Items[inv.backpack.name]
        if bpDef then total = total + bpDef.weight end
        for _, item in ipairs(inv.backpack.items) do
            local def = Items[item.name]
            if def then total = total + def.weight * (item.count or 1) end
        end
    end
    return total
end

-- Can player carry more weight?
local function CanCarry(identifier, itemName, count)
    count = count or 1
    local def = Items[itemName]
    if not def then return false end
    local current = GetWeight(identifier)
    return (current + def.weight * count) <= Config.MaxWeight
end

-- Clear inventory
local function ClearInventory(identifier)
    local inv = loadInventory(identifier, 'player')
    inv.items = {}
    if inv.backpack then
        inv.backpack.items = {}
    end
    inv.hotbar = {}
    markDirty(identifier, 'player')
end

-- Open stash for a player
local function OpenStash(playerId, stashId, label, cols, rows, maxWeight)
    if cols and rows then
        RegisterStash(stashId, cols, rows, maxWeight or Config.DefaultStashMaxWeight)
    end
    TriggerEvent('cnbt-inventory:server:requestOpen', {
        owner = stashId,
        invType = 'stash',
        label = label or 'Stash',
    })
    -- Redirect: trigger from the server on behalf of the player
    local xPlayer = ESX.GetPlayerFromId(playerId)
    if not xPlayer then return end
    TriggerClientEvent('cnbt-inventory:client:forceOpenExternal', playerId, {
        owner = stashId,
        invType = 'stash',
        label = label or 'Stash',
    })
end

-- Add item to stash
local function AddItemToStash(stashId, itemName, count, metadata)
    local def = Items[itemName]
    if not def then return false end
    count = count or 1
    metadata = metadata or {}

    local inv = loadInventory(stashId, 'stash')
    local stashDef = customStashes[stashId]
    local cols = stashDef and stashDef.cols or Config.DefaultStashCols
    local rows = stashDef and stashDef.rows or Config.DefaultStashRows

    -- Try stacking first
    if def.stackable then
        for _, item in ipairs(inv.items) do
            if item.name == itemName then
                local space = (def.maxStack or 1) - (item.count or 1)
                if space > 0 then
                    local toAdd = math.min(space, count)
                    item.count = (item.count or 1) + toAdd
                    count = count - toAdd
                    if count <= 0 then
                        markDirty(stashId, 'stash')
                        return true
                    end
                end
            end
        end
    end

    while count > 0 do
        local stackSize = def.stackable and math.min(count, def.maxStack or 1) or 1
        local x, y, rotated = findFreePosition(inv.items, cols, rows, def.sizeX, def.sizeY)
        if not x then
            markDirty(stashId, 'stash')
            return false
        end
        table.insert(inv.items, {
            name = itemName, x = x, y = y, rotated = rotated,
            count = stackSize, metadata = metadata,
        })
        count = count - stackSize
    end

    markDirty(stashId, 'stash')
    return true
end

-- ============================================
-- ITEM AT / CONSUME USE (usati da cnbt-health)
-- ============================================

-- Ritorna l'item a un indice preciso di una griglia ('player' | 'backpack')
local function GetItemAt(identifier, grid, itemIndex)
    local inv = loadInventory(identifier, 'player')
    local gridItems
    if grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
    else
        gridItems = inv.items
    end

    local item = gridItems[tonumber(itemIndex) or -1]
    if not item then return nil end
    return {
        name = item.name,
        count = item.count or 1,
        metadata = item.metadata or {},
    }
end

-- Consuma un utilizzo di un item multi-uso (stecche, tourniquette, sacche
-- di sangue, kit chirurgici). Gli usi residui vivono in metadata.uses
-- (inizializzati a maxUses al primo consumo); a 0 l'item viene rimosso.
-- Ritorna: consumed (bool), removed (bool), usesLeft (number)
local function ConsumeItemUse(identifier, grid, itemIndex, itemName, maxUses)
    local inv = loadInventory(identifier, 'player')
    local gridItems
    if grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
    else
        gridItems = inv.items
    end

    itemIndex = tonumber(itemIndex)
    local item = itemIndex and gridItems[itemIndex] or nil
    -- Rivalida: l'item deve essere ancora li' e con lo stesso nome
    if not item or item.name ~= itemName then
        return false, false, 0
    end

    item.metadata = item.metadata or {}
    local usesLeft = tonumber(item.metadata.uses) or (tonumber(maxUses) or 1)
    usesLeft = usesLeft - 1

    local removed = false
    if usesLeft <= 0 then
        table.remove(gridItems, itemIndex)
        removed = true
        usesLeft = 0
    else
        item.metadata.uses = usesLeft
    end

    markDirty(identifier, 'player')
    return true, removed, usesLeft
end

-- Register exports
exports('AddItem', AddItem)
exports('GetItemAt', GetItemAt)
exports('ConsumeItemUse', ConsumeItemUse)
exports('RemoveItem', RemoveItem)
exports('GetItemCount', GetItemCount)
exports('HasItem', HasItem)
exports('GetInventory', GetInventory)
exports('GetWeight', GetWeight)
exports('CanCarry', CanCarry)
exports('ClearInventory', ClearInventory)
exports('OpenStash', OpenStash)
exports('AddItemToStash', AddItemToStash)
exports('RegisterStash', RegisterStash)

print('[cnbt-inventory] API exports registered')
