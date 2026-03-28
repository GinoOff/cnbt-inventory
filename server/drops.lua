local ESX = exports['es_extended']:getSharedObject()

-- Active ground drops: drops[dropId] = { coords = vec3, items = {}, createdAt = os.time() }
local drops = {}
local dropCounter = 0

local function generateDropId()
    dropCounter = dropCounter + 1
    return 'drop_' .. dropCounter .. '_' .. os.time()
end

-- Create a new ground drop
local function CreateDrop(coords, items)
    local dropId = generateDropId()
    drops[dropId] = {
        coords = coords,
        items = items or {},
        createdAt = os.time(),
    }
    -- Also create in DB for persistence
    loadInventory(dropId, 'drop')
    local inv = loadInventory(dropId, 'drop')
    inv.items = items or {}
    markDirty(dropId, 'drop')

    -- Notify all clients about the new drop
    TriggerClientEvent('cnbt-inventory:client:createDrop', -1, dropId, coords)

    return dropId
end

-- Player drops an item
RegisterNetEvent('cnbt-inventory:server:dropItem')
AddEventHandler('cnbt-inventory:server:dropItem', function(data)
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
    local dropCount = data.count or item.count or 1

    local droppedItem = {
        name = item.name,
        x = 0,
        y = 0,
        rotated = false,
        count = dropCount,
        metadata = item.metadata or {},
    }

    -- Reduce or remove from player
    if dropCount >= (item.count or 1) then
        table.remove(gridItems, itemIndex)
    else
        item.count = item.count - dropCount
    end
    markDirty(identifier, 'player')

    -- Find or create drop near player
    local ped = GetPlayerPed(src)
    local coords = GetEntityCoords(ped)

    -- Check for existing drop nearby
    local nearDropId = nil
    for id, drop in pairs(drops) do
        if #(coords - drop.coords) < Config.DropMaxDistance then
            nearDropId = id
            break
        end
    end

    if nearDropId then
        local dropInv = loadInventory(nearDropId, 'drop')
        local x, y, rotated = findFreePosition(dropInv.items, Config.DropCols, Config.DropRows, Items[droppedItem.name].sizeX, Items[droppedItem.name].sizeY)
        if x then
            droppedItem.x = x
            droppedItem.y = y
            droppedItem.rotated = rotated
            table.insert(dropInv.items, droppedItem)
            markDirty(nearDropId, 'drop')
        else
            -- Create new drop if no space
            CreateDrop(coords, { droppedItem })
        end
    else
        CreateDrop(coords, { droppedItem })
    end

    -- Refresh player inventory
    TriggerClientEvent('cnbt-inventory:client:refreshInventory', src)
end)

-- Player picks up / opens a drop
RegisterNetEvent('cnbt-inventory:server:openDrop')
AddEventHandler('cnbt-inventory:server:openDrop', function(dropId)
    local src = source
    if not drops[dropId] then
        TriggerClientEvent('esx:showNotification', src, 'This drop no longer exists')
        return
    end

    local inv = loadInventory(dropId, 'drop')
    TriggerClientEvent('cnbt-inventory:client:forceOpenExternal', src, {
        owner = dropId,
        invType = 'drop',
        label = 'Ground',
    })
end)

-- Clean up empty drops
CreateThread(function()
    while true do
        Wait(10000)
        local now = os.time()
        for id, drop in pairs(drops) do
            local inv = loadInventory(id, 'drop')
            local isEmpty = not inv or #inv.items == 0
            local expired = (now - drop.createdAt) > Config.DropDespawnTime

            if isEmpty or expired then
                drops[id] = nil
                -- Clean from DB
                MySQL.execute('DELETE FROM cnbt_inventories WHERE owner = ? AND inv_type = ?', { id, 'drop' })
                -- Remove cache
                local key = id .. ':drop'
                if inventories then inventories[key] = nil end
                -- Notify clients
                TriggerClientEvent('cnbt-inventory:client:removeDrop', -1, id)
            end
        end
    end
end)

-- Sync drops to newly joined players
RegisterNetEvent('cnbt-inventory:server:requestDrops')
AddEventHandler('cnbt-inventory:server:requestDrops', function()
    local src = source
    local dropList = {}
    for id, drop in pairs(drops) do
        table.insert(dropList, { id = id, coords = drop.coords })
    end
    TriggerClientEvent('cnbt-inventory:client:syncDrops', src, dropList)
end)

-- Export
exports('CreateDrop', CreateDrop)
