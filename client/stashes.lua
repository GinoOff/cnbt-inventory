-- ============================================
-- cnbt-inventory - STASH MANAGER (client)
-- ============================================
--
-- Responsibilities:
--  1. On resource start, request the persistent stash list from the server
--     and spawn each stash prop + ox_target zone so players can interact.
--  2. /depositi: staff-only command that asks the server for the list, then
--     opens the NUI deposit manager where staff can create or delete stashes.
--  3. Placement editor: Sims-style freecam + object manipulation used when
--     creating a new stash. WASD + mouse fly the camera around, a prop follows
--     the camera's ground hit, and the staffer fine-tunes with arrow keys and
--     rotation keys before confirming with Enter.

local ESX = exports['es_extended']:getSharedObject()

-- Spawned props: id -> { entity, data }
local spawnedStashes = {}

-- ============================================
-- HELPERS
-- ============================================

local function loadModel(modelHash)
    if not IsModelInCdimage(modelHash) or not IsModelValid(modelHash) then
        return false
    end
    RequestModel(modelHash)
    local timeout = GetGameTimer() + 5000
    while not HasModelLoaded(modelHash) and GetGameTimer() < timeout do
        Wait(10)
    end
    return HasModelLoaded(modelHash)
end

local function hasOxTarget()
    return GetResourceState('ox_target') == 'started'
end

-- Register an ox_target action on a prop entity. Uses the function form
-- so we don't have to pre-declare command strings.
local function addTargetToEntity(entity, stashId, label)
    if not hasOxTarget() or not DoesEntityExist(entity) then return end
    exports.ox_target:addLocalEntity(entity, {
        {
            name = 'cnbt_stash_' .. stashId,
            label = 'Apri ' .. (label or 'Deposito'),
            icon = 'fa-solid fa-box-open',
            distance = Config.StashTargetDistance or 2.5,
            onSelect = function()
                TriggerServerEvent('cnbt-inventory:stashes:openStash', stashId)
            end,
        },
    })
end

local function removeTargetFromEntity(entity, stashId)
    if not hasOxTarget() or not entity or not DoesEntityExist(entity) then return end
    -- ox_target removes the zone automatically when the entity is deleted,
    -- but we call removeLocalEntity explicitly so a live reload is clean.
    pcall(function()
        exports.ox_target:removeLocalEntity(entity, { 'cnbt_stash_' .. stashId })
    end)
end

-- Actually spawn the prop locally and wire up ox_target.
local function spawnStashProp(id, data)
    if spawnedStashes[id] then return end
    if not data or not data.propModel or data.propModel == '' then return end

    local hash = GetHashKey(data.propModel)
    if not loadModel(hash) then
        print(('[cnbt-inventory] Failed to load stash prop model: %s'):format(data.propModel))
        return
    end

    local pos = data.position or { x = 0.0, y = 0.0, z = 0.0 }
    local rot = data.rotation or { x = 0.0, y = 0.0, z = 0.0 }

    local entity = CreateObject(hash, pos.x + 0.0, pos.y + 0.0, pos.z + 0.0, false, true, false)
    SetEntityRotation(entity, rot.x + 0.0, rot.y + 0.0, rot.z + 0.0, 2, true)
    FreezeEntityPosition(entity, true)
    SetEntityInvincible(entity, true)
    SetEntityAsMissionEntity(entity, true, true)

    SetModelAsNoLongerNeeded(hash)

    spawnedStashes[id] = { entity = entity, data = data }
    addTargetToEntity(entity, id, data.label)
end

local function despawnStashProp(id)
    local s = spawnedStashes[id]
    if not s then return end
    removeTargetFromEntity(s.entity, id)
    if DoesEntityExist(s.entity) then
        DeleteEntity(s.entity)
    end
    spawnedStashes[id] = nil
end

-- ============================================
-- BOOT: fetch existing stashes from server
-- ============================================

CreateThread(function()
    -- Wait for ESX ready
    while not ESX.PlayerData or not ESX.PlayerData.identifier do
        Wait(500)
    end
    Wait(1000)
    TriggerServerEvent('cnbt-inventory:stashes:requestAll')
end)

RegisterNetEvent('cnbt-inventory:stashes:allData')
AddEventHandler('cnbt-inventory:stashes:allData', function(list)
    -- Clear any previously spawned entries (resource restart)
    for id in pairs(spawnedStashes) do despawnStashProp(id) end
    for _, s in ipairs(list or {}) do
        spawnStashProp(s.id, s)
    end
end)

RegisterNetEvent('cnbt-inventory:stashes:spawned')
AddEventHandler('cnbt-inventory:stashes:spawned', function(id, data)
    despawnStashProp(id)
    spawnStashProp(id, data)
end)

RegisterNetEvent('cnbt-inventory:stashes:despawned')
AddEventHandler('cnbt-inventory:stashes:despawned', function(id)
    despawnStashProp(id)
end)

-- ============================================
-- /depositi COMMAND + MANAGER UI
-- ============================================

RegisterCommand('depositi', function()
    TriggerServerEvent('cnbt-inventory:stashes:openManager')
end, false)

RegisterNetEvent('cnbt-inventory:stashes:managerData')
AddEventHandler('cnbt-inventory:stashes:managerData', function(list)
    SetNuiFocus(true, true)
    SendNUIMessage({ type = 'openStashManager', stashes = list or {} })
end)

RegisterNUICallback('closeStashManager', function(_, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('deleteStash', function(data, cb)
    if data and data.id then
        TriggerServerEvent('cnbt-inventory:stashes:delete', data.id)
    end
    cb('ok')
end)

-- ============================================
-- PLACEMENT EDITOR (Sims-style freecam + object editor)
-- ============================================
--
-- Flow:
--   1. NUI sends {type='createStash', ...form data} via nuiCallback startPlacement.
--   2. We close NUI focus, spawn the prop in front of the player and enter
--      edit mode. A scripted freecam replaces the gameplay camera.
--   3. The player uses WASD + Space/Ctrl + mouse to fly the camera, arrow keys
--      to fine-tune the prop X/Y, PgUp/PgDn for Z, Q/E to rotate Z.
--   4. Enter confirms (save via server event) - Backspace cancels.

local placementActive = false
local placementCam = nil
local placementProp = nil
local pendingCreate = nil -- the form data received from NUI

-- Freecam state
local camX, camY, camZ = 0.0, 0.0, 0.0
local camYaw, camPitch = 0.0, 0.0

local function stopPlacement(commit)
    if not placementActive then return end
    placementActive = false

    if placementCam then
        RenderScriptCams(false, true, 350, true, false)
        DestroyCam(placementCam, false)
        placementCam = nil
    end

    local ped = PlayerPedId()
    FreezeEntityPosition(ped, false)
    SetEntityVisible(ped, true, false)
    SetEntityInvincible(ped, false)
    SetEntityCollision(ped, true, true)

    if placementProp and DoesEntityExist(placementProp) then
        if commit and pendingCreate then
            local coords = GetEntityCoords(placementProp)
            local rot = GetEntityRotation(placementProp, 2)
            pendingCreate.position = { x = coords.x, y = coords.y, z = coords.z }
            pendingCreate.rotation = { x = rot.x, y = rot.y, z = rot.z }
            -- Remove the temp prop - the server will broadcast the real one
            DeleteEntity(placementProp)
            placementProp = nil
            TriggerServerEvent('cnbt-inventory:stashes:create', pendingCreate)
        else
            DeleteEntity(placementProp)
            placementProp = nil
        end
    end

    pendingCreate = nil
end

-- Draw a simple HUD line at (x, y) in screen-space [0..1]
local function drawHudLine(x, y, text)
    SetTextFont(4)
    SetTextScale(0.0, 0.38)
    SetTextColour(255, 255, 255, 230)
    SetTextDropshadow(0, 0, 0, 0, 255)
    SetTextDropShadow()
    SetTextOutline()
    SetTextEntry('STRING')
    AddTextComponentString(text)
    DrawText(x, y)
end

local function startPlacement(formData)
    if placementActive then return end

    local model = formData.propModel
    if not model or model == '' then
        ESX.ShowNotification('Modello prop mancante')
        return
    end

    local hash = GetHashKey(model)
    if not loadModel(hash) then
        ESX.ShowNotification('Modello prop non valido: ' .. model)
        return
    end

    -- Close the NUI manager so the game captures input
    SetNuiFocus(false, false)
    SendNUIMessage({ type = 'closeStashManager' })

    local ped = PlayerPedId()
    local pedCoords = GetEntityCoords(ped)
    local fwd = GetEntityForwardVector(ped)

    -- Start the prop 3m in front of the player at ground level
    local startX = pedCoords.x + fwd.x * 3.0
    local startY = pedCoords.y + fwd.y * 3.0
    local _, groundZ = GetGroundZFor_3dCoord(startX, startY, pedCoords.z + 50.0, false)
    if groundZ == 0.0 then groundZ = pedCoords.z end

    placementProp = CreateObject(hash, startX, startY, groundZ, false, true, false)
    SetEntityCollision(placementProp, false, false)
    SetEntityAlpha(placementProp, 200, false)
    FreezeEntityPosition(placementProp, true)
    SetModelAsNoLongerNeeded(hash)

    -- Freecam starts 4m above the prop looking down at 30deg
    camX = startX
    camY = startY - 4.0
    camZ = groundZ + 4.0
    camYaw = 0.0
    camPitch = -25.0

    placementCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(placementCam, camX, camY, camZ)
    SetCamRot(placementCam, camPitch, 0.0, camYaw, 2)
    SetCamFov(placementCam, 60.0)
    RenderScriptCams(true, true, 500, true, false)

    -- Hide/freeze the player so the edit screen is clean
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)
    SetEntityCollision(ped, false, false)
    SetEntityInvincible(ped, true)

    pendingCreate = formData
    placementActive = true

    CreateThread(function()
        while placementActive do
            -- Block all gameplay controls (movement, shooting, phone, etc.).
            -- We'll read inputs with IsDisabledControl* instead.
            DisableAllControlActions(0)

            -- ---- Mouse look (freecam rotation) ----
            local mouseX = GetDisabledControlNormal(0, 1) * 8.0
            local mouseY = GetDisabledControlNormal(0, 2) * 8.0
            camYaw = camYaw - mouseX
            camPitch = camPitch - mouseY
            if camPitch > 89.0 then camPitch = 89.0 end
            if camPitch < -89.0 then camPitch = -89.0 end

            -- ---- WASD camera movement ----
            local fast = IsDisabledControlPressed(0, 21) -- Left Shift
            local speed = fast and 0.6 or 0.15
            local yawRad = math.rad(camYaw)
            local pitchRad = math.rad(camPitch)
            local fx = -math.sin(yawRad) * math.cos(pitchRad)
            local fy =  math.cos(yawRad) * math.cos(pitchRad)
            local fz =  math.sin(pitchRad)
            local rx =  math.cos(yawRad)
            local ry =  math.sin(yawRad)

            if IsDisabledControlPressed(0, 32) then -- W
                camX = camX + fx * speed
                camY = camY + fy * speed
                camZ = camZ + fz * speed
            end
            if IsDisabledControlPressed(0, 33) then -- S
                camX = camX - fx * speed
                camY = camY - fy * speed
                camZ = camZ - fz * speed
            end
            if IsDisabledControlPressed(0, 34) then -- A
                camX = camX - rx * speed
                camY = camY - ry * speed
            end
            if IsDisabledControlPressed(0, 35) then -- D
                camX = camX + rx * speed
                camY = camY + ry * speed
            end
            if IsDisabledControlPressed(0, 22) then -- Space: up
                camZ = camZ + speed
            end
            if IsDisabledControlPressed(0, 36) then -- Left Ctrl: down
                camZ = camZ - speed
            end

            SetCamCoord(placementCam, camX, camY, camZ)
            SetCamRot(placementCam, camPitch, 0.0, camYaw, 2)

            -- ---- Prop transform via arrow keys + Q/E + PgUp/PgDn ----
            if DoesEntityExist(placementProp) then
                local pc = GetEntityCoords(placementProp)
                local px, py, pz = pc.x, pc.y, pc.z
                local rot = GetEntityRotation(placementProp, 2)
                local propYaw = rot.z
                local propStep = fast and 0.25 or 0.05
                local rotStep  = fast and 5.0 or 1.0

                -- Move in camera-relative XY (flatten camera forward to ground)
                local flatLen = math.sqrt(fx * fx + fy * fy)
                local cfx, cfy = 0.0, 1.0
                if flatLen > 0.001 then cfx, cfy = fx / flatLen, fy / flatLen end
                local crx, cry = cfy, -cfx

                if IsDisabledControlPressed(0, 172) then -- Arrow Up
                    px = px + cfx * propStep
                    py = py + cfy * propStep
                end
                if IsDisabledControlPressed(0, 173) then -- Arrow Down
                    px = px - cfx * propStep
                    py = py - cfy * propStep
                end
                if IsDisabledControlPressed(0, 174) then -- Arrow Left
                    px = px - crx * propStep
                    py = py - cry * propStep
                end
                if IsDisabledControlPressed(0, 175) then -- Arrow Right
                    px = px + crx * propStep
                    py = py + cry * propStep
                end
                if IsDisabledControlPressed(0, 10) then -- Page Up
                    pz = pz + propStep
                end
                if IsDisabledControlPressed(0, 11) then -- Page Down
                    pz = pz - propStep
                end
                if IsDisabledControlPressed(0, 44) then -- Q
                    propYaw = propYaw - rotStep
                end
                if IsDisabledControlPressed(0, 38) then -- E
                    propYaw = propYaw + rotStep
                end

                SetEntityCoordsNoOffset(placementProp, px, py, pz, false, false, false)
                SetEntityRotation(placementProp, 0.0, 0.0, propYaw, 2, true)
            end

            -- ---- HUD hints ----
            drawHudLine(0.02, 0.02,  '~y~DEPOSIT PLACEMENT EDITOR')
            drawHudLine(0.02, 0.055, '~w~' .. (pendingCreate and pendingCreate.label or '?'))
            drawHudLine(0.02, 0.85,  '~b~WASD~w~ fly cam   ~b~SPACE/CTRL~w~ up/down   ~b~MOUSE~w~ look')
            drawHudLine(0.02, 0.875, '~b~ARROWS~w~ move prop   ~b~PGUP/PGDN~w~ height   ~b~Q/E~w~ rotate')
            drawHudLine(0.02, 0.9,   '~b~SHIFT~w~ faster   ~g~ENTER~w~ confirm   ~r~BACKSPACE~w~ cancel')

            HideHudAndRadarThisFrame()

            -- ---- Confirm / Cancel ----
            if IsDisabledControlJustReleased(0, 18) then -- Enter
                stopPlacement(true)
            elseif IsDisabledControlJustReleased(0, 177) then -- Backspace
                stopPlacement(false)
            end

            Wait(0)
        end
    end)
end

RegisterNUICallback('startStashPlacement', function(data, cb)
    cb('ok')
    if type(data) ~= 'table' then return end
    -- Validate required fields upfront
    if not data.id or data.id == '' or not data.propModel or data.propModel == '' then
        ESX.ShowNotification('Compila tutti i campi')
        return
    end
    startPlacement(data)
end)

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if placementActive then stopPlacement(false) end
    for id in pairs(spawnedStashes) do despawnStashProp(id) end
end)

print('[cnbt-inventory] Stash client loaded')
