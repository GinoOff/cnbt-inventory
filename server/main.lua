local ESX = exports['es_extended']:getSharedObject()

-- In-memory cache: inventories[owner..":"..inv_type] = { items = {}, backpack = nil, hotbar = {} }
local inventories = {}
local saveDirty = {} -- track which inventories need saving

-- ============================================
-- HELPERS
-- ============================================

local function getCacheKey(owner, invType)
    return owner .. ':' .. invType
end

local function getItemDef(name)
    return Items[name]
end

local function calcWeight(items)
    local total = 0
    for _, item in ipairs(items) do
        local def = getItemDef(item.name)
        if def then
            total = total + (def.weight * (item.count or 1))
        end
    end
    return total
end

local function getEffectiveSize(itemName, rotated)
    local def = getItemDef(itemName)
    if not def then return 1, 1 end
    if rotated then
        return def.sizeY, def.sizeX
    end
    return def.sizeX, def.sizeY
end

-- Check if placement is valid within a grid
local function canPlaceInGrid(items, cols, rows, x, y, sizeX, sizeY, excludeIndex)
    if x < 0 or y < 0 or x + sizeX > cols or y + sizeY > rows then
        return false
    end

    for i, item in ipairs(items) do
        if i ~= excludeIndex then
            local iSizeX, iSizeY = getEffectiveSize(item.name, item.rotated)
            -- AABB overlap check
            if x < item.x + iSizeX and x + sizeX > item.x and
               y < item.y + iSizeY and y + sizeY > item.y then
                return false
            end
        end
    end
    return true
end

-- Find a free position in the grid
local function findFreePosition(items, cols, rows, sizeX, sizeY)
    for testY = 0, rows - sizeY do
        for testX = 0, cols - sizeX do
            if canPlaceInGrid(items, cols, rows, testX, testY, sizeX, sizeY, nil) then
                return testX, testY, false
            end
        end
    end
    -- Try rotated
    if sizeX ~= sizeY then
        for testY = 0, rows - sizeX do
            for testX = 0, cols - sizeY do
                if canPlaceInGrid(items, cols, rows, testX, testY, sizeY, sizeX, nil) then
                    return testX, testY, true
                end
            end
        end
    end
    return nil, nil, nil
end

-- ============================================
-- DATABASE
-- ============================================

local function loadInventory(owner, invType)
    local key = getCacheKey(owner, invType)
    if inventories[key] then
        return inventories[key]
    end

    local result = MySQL.query.await('SELECT items, backpack, hotbar FROM cnbt_inventories WHERE owner = ? AND inv_type = ?', { owner, invType })

    local inv
    if result and #result > 0 then
        local row = result[1]
        inv = {
            items = json.decode(row.items) or {},
            backpack = row.backpack and json.decode(row.backpack) or nil,
            hotbar = json.decode(row.hotbar) or {},
        }
    else
        inv = { items = {}, backpack = nil, hotbar = {} }
        MySQL.insert.await('INSERT INTO cnbt_inventories (owner, inv_type, items, backpack, hotbar) VALUES (?, ?, ?, ?, ?)', {
            owner, invType, '[]', nil, '[]'
        })
    end

    inventories[key] = inv
    return inv
end

local function saveInventory(owner, invType)
    local key = getCacheKey(owner, invType)
    local inv = inventories[key]
    if not inv then return end

    MySQL.update('UPDATE cnbt_inventories SET items = ?, backpack = ?, hotbar = ? WHERE owner = ? AND inv_type = ?', {
        json.encode(inv.items),
        inv.backpack and json.encode(inv.backpack) or nil,
        json.encode(inv.hotbar),
        owner, invType,
    })
    saveDirty[key] = nil
end

local function markDirty(owner, invType)
    saveDirty[getCacheKey(owner, invType)] = { owner = owner, invType = invType }
end

-- Periodic save of dirty inventories
CreateThread(function()
    while true do
        Wait(30000) -- save every 30 seconds
        for _, data in pairs(saveDirty) do
            saveInventory(data.owner, data.invType)
        end
    end
end)

-- ============================================
-- GRID DIMENSIONS HELPER
-- ============================================

local function getGridDimensions(invType, owner)
    if invType == 'player' then
        return Config.PlayerCols, Config.PlayerRows, Config.MaxWeight
    elseif invType == 'stash' then
        -- Stashes can have custom sizes stored elsewhere; use defaults
        return Config.DefaultStashCols, Config.DefaultStashRows, Config.DefaultStashMaxWeight
    elseif invType:find('trunk_') then
        local model = invType:gsub('trunk_', '')
        local vehConfig = Config.Vehicles[model] or Config.Vehicles.default
        return vehConfig.trunk.cols, vehConfig.trunk.rows, vehConfig.trunk.maxWeight
    elseif invType:find('glovebox_') then
        local model = invType:gsub('glovebox_', '')
        local vehConfig = Config.Vehicles[model] or Config.Vehicles.default
        return vehConfig.glovebox.cols, vehConfig.glovebox.rows, vehConfig.glovebox.maxWeight
    elseif invType == 'drop' then
        return Config.DropCols, Config.DropRows, Config.DropMaxWeight
    end
    return Config.DefaultStashCols, Config.DefaultStashRows, Config.DefaultStashMaxWeight
end

-- Custom stash registry
local customStashes = {}

function RegisterStash(stashId, cols, rows, maxWeight)
    customStashes[stashId] = { cols = cols, rows = rows, maxWeight = maxWeight }
end

-- Override getGridDimensions for custom stashes
local _getGridDimensions = getGridDimensions
getGridDimensions = function(invType, owner)
    if invType == 'stash' and customStashes[owner] then
        local s = customStashes[owner]
        return s.cols, s.rows, s.maxWeight
    end
    return _getGridDimensions(invType, owner)
end

-- ============================================
-- PLAYER CONNECT / DISCONNECT
-- ============================================

RegisterNetEvent('esx:playerLoaded')
AddEventHandler('esx:playerLoaded', function(playerId, xPlayer)
    local identifier = xPlayer.identifier
    loadInventory(identifier, 'player')
end)

AddEventHandler('playerDropped', function(reason)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier
    local key = getCacheKey(identifier, 'player')
    if inventories[key] then
        saveInventory(identifier, 'player')
        inventories[key] = nil
    end
end)

-- Save all on resource stop
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for _, data in pairs(saveDirty) do
        saveInventory(data.owner, data.invType)
    end
    -- Force save all cached
    for key, inv in pairs(inventories) do
        local owner, invType = key:match('^(.+):(.+)$')
        if owner and invType then
            saveInventory(owner, invType)
        end
    end
end)

-- ============================================
-- NUI CALLBACKS (from client)
-- ============================================

-- Open inventory: send player data to NUI
RegisterNetEvent('cnbt-inventory:server:requestOpen')
AddEventHandler('cnbt-inventory:server:requestOpen', function(externalData)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local identifier = xPlayer.identifier
    local inv = loadInventory(identifier, 'player')

    local playerData = {
        items = inv.items,
        backpack = inv.backpack,
        hotbar = inv.hotbar,
        cols = Config.PlayerCols,
        rows = Config.PlayerRows,
        maxWeight = Config.MaxWeight,
    }

    local externalInv = nil
    if externalData then
        local extInv = loadInventory(externalData.owner, externalData.invType)
        local cols, rows, maxWeight = getGridDimensions(externalData.invType, externalData.owner)
        externalInv = {
            items = extInv.items,
            owner = externalData.owner,
            invType = externalData.invType,
            cols = cols,
            rows = rows,
            maxWeight = maxWeight,
            label = externalData.label or 'Storage',
        }
    end

    TriggerClientEvent('cnbt-inventory:client:openInventory', src, playerData, externalInv)
end)

-- Move item within the same grid
RegisterNetEvent('cnbt-inventory:server:moveItem')
AddEventHandler('cnbt-inventory:server:moveItem', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end

    local identifier = xPlayer.identifier
    local owner = data.owner or identifier
    local invType = data.invType or 'player'
    local inv = loadInventory(owner, invType)

    local gridItems
    if data.grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
    else
        gridItems = inv.items
    end

    local itemIndex = data.itemIndex
    if not gridItems[itemIndex] then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local item = gridItems[itemIndex]
    local sizeX, sizeY = getEffectiveSize(item.name, data.rotated)

    local cols, rows
    if data.grid == 'backpack' and inv.backpack then
        local bpDef = Config.Backpacks[inv.backpack.name]
        if bpDef then
            cols, rows = bpDef.cols, bpDef.rows
        else
            TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
            return
        end
    else
        cols, rows = getGridDimensions(invType, owner)
    end

    if canPlaceInGrid(gridItems, cols, rows, data.x, data.y, sizeX, sizeY, itemIndex) then
        item.x = data.x
        item.y = data.y
        item.rotated = data.rotated
        markDirty(owner, invType)
        TriggerClientEvent('cnbt-inventory:client:moveSuccess', src, data)
    else
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
    end
end)

-- Transfer item between two inventories/grids
RegisterNetEvent('cnbt-inventory:server:transferItem')
AddEventHandler('cnbt-inventory:server:transferItem', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    -- Source
    local srcOwner = data.srcOwner or identifier
    local srcInvType = data.srcInvType or 'player'
    local srcInv = loadInventory(srcOwner, srcInvType)
    local srcGridItems
    if data.srcGrid == 'backpack' and srcInv.backpack then
        srcGridItems = srcInv.backpack.items
    else
        srcGridItems = srcInv.items
    end

    -- Dest
    local dstOwner = data.dstOwner or identifier
    local dstInvType = data.dstInvType or 'player'
    local dstInv = loadInventory(dstOwner, dstInvType)
    local dstGridItems
    if data.dstGrid == 'backpack' and dstInv.backpack then
        dstGridItems = dstInv.backpack.items
    else
        dstGridItems = dstInv.items
    end

    local itemIndex = data.itemIndex
    if not srcGridItems[itemIndex] then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local item = srcGridItems[itemIndex]
    local def = getItemDef(item.name)
    if not def then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local sizeX, sizeY = getEffectiveSize(item.name, data.rotated)
    local dstCols, dstRows, dstMaxWeight
    if data.dstGrid == 'backpack' and dstInv.backpack then
        local bpDef = Config.Backpacks[dstInv.backpack.name]
        dstCols, dstRows = bpDef.cols, bpDef.rows
        dstMaxWeight = bpDef.maxWeight
    else
        dstCols, dstRows, dstMaxWeight = getGridDimensions(dstInvType, dstOwner)
    end

    -- Weight check
    local currentWeight = calcWeight(dstGridItems)
    local addWeight = def.weight * (item.count or 1)
    if currentWeight + addWeight > dstMaxWeight then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    if canPlaceInGrid(dstGridItems, dstCols, dstRows, data.x, data.y, sizeX, sizeY, nil) then
        -- Remove from source
        table.remove(srcGridItems, itemIndex)
        -- Add to dest
        local newItem = {
            name = item.name,
            x = data.x,
            y = data.y,
            rotated = data.rotated,
            count = item.count or 1,
            metadata = item.metadata or {},
        }
        table.insert(dstGridItems, newItem)

        markDirty(srcOwner, srcInvType)
        markDirty(dstOwner, dstInvType)

        TriggerClientEvent('cnbt-inventory:client:transferSuccess', src, data)
    else
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
    end
end)

-- Stack items
RegisterNetEvent('cnbt-inventory:server:stackItem')
AddEventHandler('cnbt-inventory:server:stackItem', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local owner = data.owner or identifier
    local invType = data.invType or 'player'
    local inv = loadInventory(owner, invType)
    local gridItems
    if data.grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
    else
        gridItems = inv.items
    end

    local srcIdx = data.srcIndex
    local dstIdx = data.dstIndex
    if not gridItems[srcIdx] or not gridItems[dstIdx] then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local srcItem = gridItems[srcIdx]
    local dstItem = gridItems[dstIdx]
    if srcItem.name ~= dstItem.name then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local def = getItemDef(srcItem.name)
    if not def or not def.stackable then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local maxStack = def.maxStack or 1
    local space = maxStack - (dstItem.count or 1)
    if space <= 0 then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local toTransfer = math.min(space, srcItem.count or 1)
    dstItem.count = (dstItem.count or 1) + toTransfer
    srcItem.count = (srcItem.count or 1) - toTransfer

    if srcItem.count <= 0 then
        table.remove(gridItems, srcIdx)
    end

    markDirty(owner, invType)
    TriggerClientEvent('cnbt-inventory:client:stackSuccess', src, data)
end)

-- Split stack
RegisterNetEvent('cnbt-inventory:server:splitStack')
AddEventHandler('cnbt-inventory:server:splitStack', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local owner = data.owner or identifier
    local invType = data.invType or 'player'
    local inv = loadInventory(owner, invType)
    local gridItems
    if data.grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
    else
        gridItems = inv.items
    end

    local itemIndex = data.itemIndex
    if not gridItems[itemIndex] then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local item = gridItems[itemIndex]
    local splitCount = data.splitCount
    if not splitCount or splitCount <= 0 or splitCount >= (item.count or 1) then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local sizeX, sizeY = getEffectiveSize(item.name, data.rotated or false)
    local cols, rows
    if data.grid == 'backpack' and inv.backpack then
        local bpDef = Config.Backpacks[inv.backpack.name]
        cols, rows = bpDef.cols, bpDef.rows
    else
        cols, rows = getGridDimensions(invType, owner)
    end

    if not canPlaceInGrid(gridItems, cols, rows, data.x, data.y, sizeX, sizeY, nil) then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    item.count = item.count - splitCount
    local newItem = {
        name = item.name,
        x = data.x,
        y = data.y,
        rotated = data.rotated or false,
        count = splitCount,
        metadata = {},
    }
    table.insert(gridItems, newItem)

    markDirty(owner, invType)
    TriggerClientEvent('cnbt-inventory:client:splitSuccess', src, data)
end)

-- Use item
RegisterNetEvent('cnbt-inventory:server:useItem')
AddEventHandler('cnbt-inventory:server:useItem', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local inv = loadInventory(identifier, 'player')
    local gridItems
    if data.grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
    else
        gridItems = inv.items
    end

    local itemIndex = data.itemIndex
    if not gridItems[itemIndex] then return end

    local item = gridItems[itemIndex]
    local def = getItemDef(item.name)
    if not def or not def.usable then return end

    -- Trigger ESX item use
    TriggerEvent('cnbt-inventory:server:itemUsed', src, item.name, item, data.grid)

    -- If consumable, reduce count
    if def.stackable and def.usable then
        item.count = (item.count or 1) - 1
        if item.count <= 0 then
            table.remove(gridItems, itemIndex)
        end
        markDirty(identifier, 'player')
    end

    TriggerClientEvent('cnbt-inventory:client:useSuccess', src, data)
end)

-- Equip/unequip backpack
RegisterNetEvent('cnbt-inventory:server:equipBackpack')
AddEventHandler('cnbt-inventory:server:equipBackpack', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local inv = loadInventory(identifier, 'player')
    local itemIndex = data.itemIndex

    if not inv.items[itemIndex] then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local item = inv.items[itemIndex]
    if not Config.Backpacks[item.name] then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    -- If already have a backpack equipped, deny (must unequip first)
    if inv.backpack then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    -- Remove from inventory and equip
    table.remove(inv.items, itemIndex)
    inv.backpack = {
        name = item.name,
        metadata = item.metadata or {},
        items = {},
    }

    markDirty(identifier, 'player')
    TriggerClientEvent('cnbt-inventory:client:backpackEquipped', src, inv.backpack)
end)

RegisterNetEvent('cnbt-inventory:server:unequipBackpack')
AddEventHandler('cnbt-inventory:server:unequipBackpack', function()
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local inv = loadInventory(identifier, 'player')
    if not inv.backpack then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    -- Check if backpack has items -> need to dump them or deny
    if #inv.backpack.items > 0 then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    local bpItem = {
        name = inv.backpack.name,
        rotated = false,
        count = 1,
        metadata = inv.backpack.metadata or {},
    }

    -- Find free space in player inventory
    local def = getItemDef(bpItem.name)
    local x, y, rotated = findFreePosition(inv.items, Config.PlayerCols, Config.PlayerRows, def.sizeX, def.sizeY)
    if not x then
        TriggerClientEvent('cnbt-inventory:client:moveFailed', src)
        return
    end

    bpItem.x = x
    bpItem.y = y
    bpItem.rotated = rotated
    table.insert(inv.items, bpItem)
    inv.backpack = nil

    markDirty(identifier, 'player')
    TriggerClientEvent('cnbt-inventory:client:backpackUnequipped', src)
end)

-- Update hotbar
RegisterNetEvent('cnbt-inventory:server:updateHotbar')
AddEventHandler('cnbt-inventory:server:updateHotbar', function(hotbar)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local inv = loadInventory(identifier, 'player')
    inv.hotbar = hotbar or {}
    markDirty(identifier, 'player')
end)

-- Sort inventory
RegisterNetEvent('cnbt-inventory:server:sortInventory')
AddEventHandler('cnbt-inventory:server:sortInventory', function(data)
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    local owner = data.owner or identifier
    local invType = data.invType or 'player'
    local inv = loadInventory(owner, invType)
    local gridItems
    local cols, rows

    if data.grid == 'backpack' and inv.backpack then
        gridItems = inv.backpack.items
        local bpDef = Config.Backpacks[inv.backpack.name]
        cols, rows = bpDef.cols, bpDef.rows
    else
        gridItems = inv.items
        cols, rows = getGridDimensions(invType, owner)
    end

    -- Sort by area descending
    table.sort(gridItems, function(a, b)
        local defA = getItemDef(a.name)
        local defB = getItemDef(b.name)
        local areaA = (defA and defA.sizeX * defA.sizeY) or 1
        local areaB = (defB and defB.sizeX * defB.sizeY) or 1
        return areaA > areaB
    end)

    local sortMode = data.mode or 'vertical' -- vertical or horizontal
    local placed = {}
    local failed = {}

    for _, item in ipairs(gridItems) do
        local def = getItemDef(item.name)
        if not def then goto continue end

        local px, py, pRotated = nil, nil, nil

        if sortMode == 'vertical' then
            -- Scan top to bottom, left to right
            for testY = 0, rows - 1 do
                for testX = 0, cols - 1 do
                    if canPlaceInGrid(placed, cols, rows, testX, testY, def.sizeX, def.sizeY, nil) then
                        px, py, pRotated = testX, testY, false
                        goto found
                    end
                    if def.sizeX ~= def.sizeY and canPlaceInGrid(placed, cols, rows, testX, testY, def.sizeY, def.sizeX, nil) then
                        px, py, pRotated = testX, testY, true
                        goto found
                    end
                end
            end
        else
            -- Scan left to right, top to bottom
            for testX = 0, cols - 1 do
                for testY = 0, rows - 1 do
                    if canPlaceInGrid(placed, cols, rows, testX, testY, def.sizeX, def.sizeY, nil) then
                        px, py, pRotated = testX, testY, false
                        goto found
                    end
                    if def.sizeX ~= def.sizeY and canPlaceInGrid(placed, cols, rows, testX, testY, def.sizeY, def.sizeX, nil) then
                        px, py, pRotated = testX, testY, true
                        goto found
                    end
                end
            end
        end

        ::found::
        if px then
            item.x = px
            item.y = py
            item.rotated = pRotated
            table.insert(placed, item)
        else
            table.insert(failed, item)
        end

        ::continue::
    end

    -- Put failed items back (shouldn't happen if grid was valid before)
    for _, item in ipairs(failed) do
        table.insert(placed, item)
    end

    if data.grid == 'backpack' and inv.backpack then
        inv.backpack.items = placed
    else
        inv.items = placed
    end

    markDirty(owner, invType)
    TriggerClientEvent('cnbt-inventory:client:sortComplete', src, {
        grid = data.grid,
        items = placed,
        owner = owner,
        invType = invType,
    })
end)

-- Close inventory
RegisterNetEvent('cnbt-inventory:server:closeInventory')
AddEventHandler('cnbt-inventory:server:closeInventory', function()
    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return end
    local identifier = xPlayer.identifier

    -- Immediately save player inventory
    saveInventory(identifier, 'player')
end)

-- ============================================
-- ADMIN / DEBUG
-- ============================================

-- /giveitem [player_id] [item_name] [count]
-- Admin command to give items to any player
-- Example: /giveitem 1 water 5
RegisterCommand('giveitem', function(source, args)
    local src = source

    -- Allow from console (src == 0) or from admin players
    if src ~= 0 then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer or xPlayer.getGroup() ~= 'admin' then
            TriggerClientEvent('esx:showNotification', src, '~r~No permission')
            return
        end
    end

    local targetId = tonumber(args[1])
    local itemName = args[2]
    local count = tonumber(args[3]) or 1

    if not targetId or not itemName then
        local msg = 'Usage: /giveitem [player_id] [item_name] [count]'
        if src == 0 then
            print(msg)
        else
            TriggerClientEvent('esx:showNotification', src, msg)
        end
        return
    end

    if not Items[itemName] then
        local msg = 'Unknown item: "' .. itemName .. '". Check items.lua for valid item names (the key, not the label).'
        if src == 0 then
            print(msg)
        else
            TriggerClientEvent('esx:showNotification', src, '~r~' .. msg)
        end
        return
    end

    local targetPlayer = ESX.GetPlayerFromId(targetId)
    if not targetPlayer then
        local msg = 'Player ID ' .. targetId .. ' not found'
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~r~' .. msg) end
        return
    end

    local success = exports['cnbt-inventory']:AddItem(targetPlayer.identifier, itemName, count)
    if success then
        local def = Items[itemName]
        local msg = 'Gave ' .. count .. 'x ' .. def.label .. ' (' .. itemName .. ') to player ' .. targetId
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~g~' .. msg) end
        TriggerClientEvent('esx:showNotification', targetId, '~g~Received ' .. count .. 'x ' .. def.label)
    else
        local msg = 'Failed: no space in inventory for ' .. itemName
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~r~' .. msg) end
    end
end, false)

-- /additem [item_name] [count]
-- Admin shortcut to give items to yourself
-- Example: /additem weapon_rifle 1
RegisterCommand('additem', function(source, args)
    local src = source
    if src == 0 then
        print('Cannot use /additem from console. Use /giveitem instead.')
        return
    end

    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer or xPlayer.getGroup() ~= 'admin' then
        TriggerClientEvent('esx:showNotification', src, '~r~No permission')
        return
    end

    local itemName = args[1]
    local count = tonumber(args[2]) or 1

    if not itemName then
        TriggerClientEvent('esx:showNotification', src, 'Usage: /additem [item_name] [count]')
        return
    end

    if not Items[itemName] then
        TriggerClientEvent('esx:showNotification', src, '~r~Unknown item: "' .. itemName .. '"')
        return
    end

    local success = exports['cnbt-inventory']:AddItem(xPlayer.identifier, itemName, count)
    if success then
        local def = Items[itemName]
        TriggerClientEvent('esx:showNotification', src, '~g~Added ' .. count .. 'x ' .. def.label .. ' (' .. itemName .. ')')
    else
        TriggerClientEvent('esx:showNotification', src, '~r~No space in inventory')
    end
end, false)

-- /removeitem [player_id] [item_name] [count]
-- Admin command to remove items from a player
RegisterCommand('removeitem', function(source, args)
    local src = source

    if src ~= 0 then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer or xPlayer.getGroup() ~= 'admin' then
            TriggerClientEvent('esx:showNotification', src, '~r~No permission')
            return
        end
    end

    local targetId = tonumber(args[1])
    local itemName = args[2]
    local count = tonumber(args[3]) or 1

    if not targetId or not itemName then
        local msg = 'Usage: /removeitem [player_id] [item_name] [count]'
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, msg) end
        return
    end

    local targetPlayer = ESX.GetPlayerFromId(targetId)
    if not targetPlayer then
        local msg = 'Player ID ' .. targetId .. ' not found'
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~r~' .. msg) end
        return
    end

    local success = exports['cnbt-inventory']:RemoveItem(targetPlayer.identifier, itemName, count)
    if success then
        local def = Items[itemName]
        local label = def and def.label or itemName
        local msg = 'Removed ' .. count .. 'x ' .. label .. ' from player ' .. targetId
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~g~' .. msg) end
    else
        local msg = 'Player does not have enough of that item'
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~r~' .. msg) end
    end
end, false)

-- /clearinv [player_id]
-- Admin command to clear a player's inventory
RegisterCommand('clearinv', function(source, args)
    local src = source

    if src ~= 0 then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer or xPlayer.getGroup() ~= 'admin' then
            TriggerClientEvent('esx:showNotification', src, '~r~No permission')
            return
        end
    end

    local targetId = tonumber(args[1])
    if not targetId then
        local msg = 'Usage: /clearinv [player_id]'
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, msg) end
        return
    end

    local targetPlayer = ESX.GetPlayerFromId(targetId)
    if not targetPlayer then
        local msg = 'Player ID ' .. targetId .. ' not found'
        if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~r~' .. msg) end
        return
    end

    exports['cnbt-inventory']:ClearInventory(targetPlayer.identifier)
    local msg = 'Cleared inventory of player ' .. targetId
    if src == 0 then print(msg) else TriggerClientEvent('esx:showNotification', src, '~g~' .. msg) end
    TriggerClientEvent('esx:showNotification', targetId, '~r~Your inventory has been cleared by an admin')
end, false)

-- /listitems
-- Shows all registered item names (for reference when using /giveitem)
RegisterCommand('listitems', function(source, args)
    local src = source

    if src ~= 0 then
        local xPlayer = ESX.GetPlayerFromId(src)
        if not xPlayer or xPlayer.getGroup() ~= 'admin' then
            TriggerClientEvent('esx:showNotification', src, '~r~No permission')
            return
        end
    end

    local filter = args[1] -- optional category filter

    local lines = {}
    for name, def in pairs(Items) do
        if not filter or def.category == filter then
            table.insert(lines, string.format('  %s -> %s [%dx%d] (%s)', name, def.label, def.sizeX, def.sizeY, def.category))
        end
    end

    table.sort(lines)

    if src == 0 then
        print('=== Registered Items ===')
        for _, line in ipairs(lines) do
            print(line)
        end
        print('Total: ' .. #lines .. ' items')
    else
        -- Send as chat messages
        TriggerClientEvent('chat:addMessage', src, { args = { '^3=== Items (' .. #lines .. ') ===' } })
        for _, line in ipairs(lines) do
            TriggerClientEvent('chat:addMessage', src, { args = { '^2' .. line } })
        end
        TriggerClientEvent('chat:addMessage', src, { args = { '^3Filter by category: /listitems [medical|food|weapon|ammo|backpack|misc]' } })
    end
end, false)

print('[cnbt-inventory] Server loaded successfully')
