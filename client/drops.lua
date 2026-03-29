-- Client-side drop rendering and interaction
-- One bag prop per drop zone (mini-stash), NOT one prop per item

local activeDrops = {} -- dropId -> { coords, object }
local nearbyDrop = nil
local propModelHash = nil

-- ============================================
-- DROP MANAGEMENT
-- ============================================

local function ensureModel()
    if propModelHash and HasModelLoaded(propModelHash) then return true end

    propModelHash = GetHashKey(Config.DropPropModel or 'prop_cs_rucksack')
    RequestModel(propModelHash)

    local timeout = 0
    while not HasModelLoaded(propModelHash) and timeout < 100 do
        Wait(10)
        timeout = timeout + 1
    end

    return HasModelLoaded(propModelHash)
end

local function createDropVisual(dropId, coords)
    if activeDrops[dropId] then return end

    local obj = nil
    if ensureModel() then
        obj = CreateObject(propModelHash, coords.x, coords.y, coords.z, false, false, false)
        PlaceObjectOnGroundProperly(obj)
        FreezeEntityPosition(obj, true)
        SetEntityCollision(obj, false, false)
    end

    activeDrops[dropId] = {
        coords = coords,
        object = obj,
    }
end

local function removeDropVisual(dropId)
    local drop = activeDrops[dropId]
    if not drop then return end

    if drop.object and DoesEntityExist(drop.object) then
        DeleteEntity(drop.object)
    end

    activeDrops[dropId] = nil
end

-- ============================================
-- EVENTS
-- ============================================

RegisterNetEvent('cnbt-inventory:client:createDrop')
AddEventHandler('cnbt-inventory:client:createDrop', function(dropId, coords)
    createDropVisual(dropId, coords)
end)

RegisterNetEvent('cnbt-inventory:client:removeDrop')
AddEventHandler('cnbt-inventory:client:removeDrop', function(dropId)
    removeDropVisual(dropId)
end)

RegisterNetEvent('cnbt-inventory:client:syncDrops')
AddEventHandler('cnbt-inventory:client:syncDrops', function(dropList)
    for _, drop in ipairs(dropList) do
        createDropVisual(drop.id, drop.coords)
    end
end)

-- ============================================
-- PROXIMITY CHECK (optimized: runs every 500ms)
-- ============================================

CreateThread(function()
    while true do
        Wait(500)
        local ped = PlayerPedId()
        local pCoords = GetEntityCoords(ped)
        local closestDrop = nil
        local closestDist = Config.DropMaxDistance + 1

        for id, drop in pairs(activeDrops) do
            local dist = #(pCoords - drop.coords)
            if dist < closestDist then
                closestDist = dist
                closestDrop = id
            end
        end

        nearbyDrop = closestDrop
    end
end)

-- Draw prompt when near a drop (separate thread for rendering)
CreateThread(function()
    while true do
        if nearbyDrop and activeDrops[nearbyDrop] then
            DrawText3D(activeDrops[nearbyDrop].coords, '[E] Pick up')
            Wait(0) -- render every frame
        else
            Wait(500) -- idle
        end
    end
end)

-- Interact with drop
RegisterCommand('pickup', function()
    if nearbyDrop then
        TriggerServerEvent('cnbt-inventory:server:openDrop', nearbyDrop)
    end
end, false)
RegisterKeyMapping('pickup', 'Pick up items', 'keyboard', 'E')

-- ============================================
-- HELPER: 3D text drawing
-- ============================================

function DrawText3D(coords, text)
    local onScreen, x, y = World3dToScreen2d(coords.x, coords.y, coords.z + 0.3)
    if onScreen then
        SetTextScale(0.3, 0.3)
        SetTextFont(4)
        SetTextProportional(true)
        SetTextColour(255, 255, 255, 215)
        SetTextOutline()
        SetTextEntry('STRING')
        SetTextCentre(true)
        AddTextComponentString(text)
        DrawText(x, y)
    end
end

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for id, _ in pairs(activeDrops) do
        removeDropVisual(id)
    end
    if propModelHash then
        SetModelAsNoLongerNeeded(propModelHash)
    end
end)
