-- ============================================
-- cnbt-inventory - INVENTORY MANAGER (server)
-- ============================================
--
-- Staff command /inventari to list, inspect and delete player inventories.
-- Uses the same admin group whitelist as /depositi (Config.DepositAdminGroups).

local ESX = exports['es_extended']:getSharedObject()

local function isAdmin(src)
    local xPlayer = ESX.GetPlayerFromId(src)
    if not xPlayer then return false end
    local group = xPlayer.getGroup and xPlayer.getGroup() or nil
    if not group then return false end
    return Config.DepositAdminGroups and Config.DepositAdminGroups[group] == true
end

-- ============================================
-- /inventari COMMAND
-- ============================================

RegisterCommand('inventari', function(source)
    local src = source
    if src == 0 then return end -- console only
    if not isAdmin(src) then
        TriggerClientEvent('esx:showNotification', src, 'Non hai i permessi.')
        return
    end
    TriggerServerEvent('cnbt-inventory:inventories:openManager')
end, false)

-- Alias: also register as net event so the client can trigger it
RegisterNetEvent('cnbt-inventory:inventories:openManager')
AddEventHandler('cnbt-inventory:inventories:openManager', function()
    local src = source
    if not isAdmin(src) then return end

    -- Query all inventories from DB
    local rows = MySQL.query.await(
        'SELECT owner, inv_type, items, backpack, hotbar FROM cnbt_inventories ORDER BY owner ASC, inv_type ASC'
    )

    local list = {}
    if rows then
        for _, row in ipairs(rows) do
            local items = json.decode(row.items) or {}
            local itemCount = #items
            local totalWeight = 0
            for _, item in ipairs(items) do
                local def = getItemDef(item.name)
                if def then
                    totalWeight = totalWeight + (def.weight * (item.count or 1))
                end
            end

            table.insert(list, {
                owner = row.owner,
                invType = row.inv_type,
                itemCount = itemCount,
                totalWeight = totalWeight,
                items = items,
                hasBackpack = row.backpack ~= nil and row.backpack ~= '',
            })
        end
    end

    TriggerClientEvent('cnbt-inventory:inventories:managerData', src, list)
end)

-- ============================================
-- VIEW INVENTORY DETAIL
-- ============================================

RegisterNetEvent('cnbt-inventory:inventories:viewDetail')
AddEventHandler('cnbt-inventory:inventories:viewDetail', function(data)
    local src = source
    if not isAdmin(src) then return end

    local owner = data.owner
    local invType = data.invType
    if not owner or not invType then return end

    local result = MySQL.query.await(
        'SELECT items, backpack, hotbar FROM cnbt_inventories WHERE owner = ? AND inv_type = ?',
        { owner, invType }
    )

    local detail = { owner = owner, invType = invType, items = {}, backpack = nil }
    if result and #result > 0 then
        local row = result[1]
        detail.items = json.decode(row.items) or {}
        if row.backpack and row.backpack ~= '' then
            detail.backpack = json.decode(row.backpack)
        end
    end

    -- Enrich items with definition data for NUI display
    local enriched = {}
    for i, item in ipairs(detail.items) do
        local def = getItemDef(item.name)
        table.insert(enriched, {
            index = i,
            name = item.name,
            label = def and def.label or item.name,
            count = item.count or 1,
            weight = def and def.weight or 0,
            image = def and def.image or nil,
            x = item.x,
            y = item.y,
            metadata = item.metadata,
        })
    end
    detail.items = enriched

    -- Enrich backpack items too
    if detail.backpack and detail.backpack.items then
        local bpEnriched = {}
        for i, item in ipairs(detail.backpack.items) do
            local def = getItemDef(item.name)
            table.insert(bpEnriched, {
                index = i,
                name = item.name,
                label = def and def.label or item.name,
                count = item.count or 1,
                weight = def and def.weight or 0,
                image = def and def.image or nil,
            })
        end
        detail.backpack.items = bpEnriched
        local bpDef = getItemDef(detail.backpack.name)
        detail.backpack.label = bpDef and bpDef.label or detail.backpack.name
    end

    TriggerClientEvent('cnbt-inventory:inventories:detailData', src, detail)
end)

-- ============================================
-- DELETE ITEM FROM INVENTORY
-- ============================================

RegisterNetEvent('cnbt-inventory:inventories:deleteItem')
AddEventHandler('cnbt-inventory:inventories:deleteItem', function(data)
    local src = source
    if not isAdmin(src) then return end

    local owner = data.owner
    local invType = data.invType
    local itemIndex = data.itemIndex
    local grid = data.grid or 'main' -- 'main' or 'backpack'
    if not owner or not invType or not itemIndex then return end

    local key = getCacheKey(owner, invType)
    local inv = inventories[key]

    -- If not in cache, load from DB
    if not inv then
        inv = loadInventory(owner, invType)
    end

    if grid == 'backpack' and inv.backpack and inv.backpack.items then
        if inv.backpack.items[itemIndex] then
            table.remove(inv.backpack.items, itemIndex)
        end
    else
        if inv.items[itemIndex] then
            table.remove(inv.items, itemIndex)
        end
    end

    -- Force save immediately
    markDirty(owner, invType)
    saveInventory(owner, invType)

    TriggerClientEvent('cnbt-inventory:inventories:deleteItemSuccess', src, {
        owner = owner,
        invType = invType,
        itemIndex = itemIndex,
        grid = grid,
    })
end)

-- ============================================
-- CLEAR ENTIRE INVENTORY
-- ============================================

RegisterNetEvent('cnbt-inventory:inventories:clearInventory')
AddEventHandler('cnbt-inventory:inventories:clearInventory', function(data)
    local src = source
    if not isAdmin(src) then return end

    local owner = data.owner
    local invType = data.invType
    if not owner or not invType then return end

    local key = getCacheKey(owner, invType)
    local inv = inventories[key]

    if not inv then
        inv = loadInventory(owner, invType)
    end

    inv.items = {}
    if inv.backpack then
        inv.backpack.items = {}
    end
    inv.hotbar = {}

    markDirty(owner, invType)
    saveInventory(owner, invType)

    TriggerClientEvent('cnbt-inventory:inventories:clearSuccess', src, {
        owner = owner,
        invType = invType,
    })
end)
