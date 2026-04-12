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
-- PLACEMENT EDITOR (freecam + 3D gizmo)
-- ============================================
--
-- Flow:
--   1. NUI sends form data via startStashPlacement callback.
--   2. We close NUI focus, spawn the prop and enter edit mode with a freecam.
--   3. WASD + mouse fly the camera. A 3D gizmo (axis arrows + plane handles)
--      lets the user click-drag to translate the prop. Arrow keys, PgUp/PgDn,
--      Q/E still work for keyboard fine-tuning. Enter confirms, Backspace cancels.

local placementActive = false
local placementCam = nil
local placementProp = nil
local pendingCreate = nil

-- Freecam state
local camX, camY, camZ = 0.0, 0.0, 0.0
local camYaw, camPitch = 0.0, 0.0

-- Gizmo configuration
local GIZMO_LEN        = 1.2     -- arrow length (world units)
local GIZMO_HEAD_LEN   = 0.14    -- arrowhead cone length
local GIZMO_HEAD_W     = 0.07    -- arrowhead cone half-width
local GIZMO_PLANE_OFF  = 0.35    -- plane-handle offset from centre
local GIZMO_PLANE_SZ   = 0.18    -- plane-handle square size
local GIZMO_HIT_RADIUS = 0.04    -- screen-space hover threshold (0-1)
local GIZMO_DRAG_SENS  = 15.0    -- base sensitivity for mouse drag

-- Gizmo runtime state
local gizmoDragging = false
local gizmoTarget   = nil  -- 'x'|'y'|'z'|'xy'|'xz'|'yz'
local gizmoHover    = nil

-- Axis definitions: direction + colour (Red=X, Blue=Y, Green=Z)
local GIZMO_AXES = {
    { id = 'x', dx = 1.0, dy = 0.0, dz = 0.0, r = 230, g = 60,  b = 60  },
    { id = 'y', dx = 0.0, dy = 1.0, dz = 0.0, r = 60,  g = 60,  b = 230 },
    { id = 'z', dx = 0.0, dy = 0.0, dz = 1.0, r = 60,  g = 230, b = 60  },
}

-- Plane-handle definitions (pairs of axes)
local GIZMO_PLANES = {
    { id = 'xy', i1 = 1, i2 = 2, r = 230, g = 230, b = 60  },
    { id = 'xz', i1 = 1, i2 = 3, r = 230, g = 60,  b = 230 },
    { id = 'yz', i1 = 2, i2 = 3, r = 60,  g = 230, b = 230 },
}

-- ============================================
-- GIZMO HELPERS
-- ============================================

-- Build two perpendicular unit vectors for a given axis direction.
local function gizmoPerp(dx, dy, dz)
    local ux, uy, uz
    if math.abs(dz) < 0.9 then
        ux, uy, uz = -dy, dx, 0.0
    else
        ux, uy, uz = 0.0, -dz, dy
    end
    local ulen = math.sqrt(ux * ux + uy * uy + uz * uz)
    if ulen > 0.001 then ux, uy, uz = ux / ulen, uy / ulen, uz / ulen end
    local vx = dy * uz - dz * uy
    local vy = dz * ux - dx * uz
    local vz = dx * uy - dy * ux
    return ux, uy, uz, vx, vy, vz
end

-- Draw the full gizmo (axes + arrowheads + plane handles) centred at (ox,oy,oz).
local function drawGizmo(ox, oy, oz)
    for _, ax in ipairs(GIZMO_AXES) do
        local tipX = ox + ax.dx * GIZMO_LEN
        local tipY = oy + ax.dy * GIZMO_LEN
        local tipZ = oz + ax.dz * GIZMO_LEN
        local r, g, b, a = ax.r, ax.g, ax.b, 200
        if gizmoHover == ax.id or gizmoTarget == ax.id then
            r = math.min(255, r + 60)
            g = math.min(255, g + 60)
            b = math.min(255, b + 60)
            a = 255
        end
        -- Shaft line
        DrawLine(ox, oy, oz, tipX, tipY, tipZ, r, g, b, a)
        -- Arrowhead (4-fin filled pyramid, double-sided)
        local ux, uy, uz, vx, vy, vz = gizmoPerp(ax.dx, ax.dy, ax.dz)
        local bx = tipX - ax.dx * GIZMO_HEAD_LEN
        local by = tipY - ax.dy * GIZMO_HEAD_LEN
        local bz = tipZ - ax.dz * GIZMO_HEAD_LEN
        local w = GIZMO_HEAD_W
        local p1x, p1y, p1z = bx + ux * w, by + uy * w, bz + uz * w
        local p2x, p2y, p2z = bx - ux * w, by - uy * w, bz - uz * w
        local p3x, p3y, p3z = bx + vx * w, by + vy * w, bz + vz * w
        local p4x, p4y, p4z = bx - vx * w, by - vy * w, bz - vz * w
        DrawPoly(tipX, tipY, tipZ, p1x, p1y, p1z, p3x, p3y, p3z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p3x, p3y, p3z, p1x, p1y, p1z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p3x, p3y, p3z, p2x, p2y, p2z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p2x, p2y, p2z, p3x, p3y, p3z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p2x, p2y, p2z, p4x, p4y, p4z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p4x, p4y, p4z, p2x, p2y, p2z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p4x, p4y, p4z, p1x, p1y, p1z, r, g, b, a)
        DrawPoly(tipX, tipY, tipZ, p1x, p1y, p1z, p4x, p4y, p4z, r, g, b, a)
    end

    -- Plane handles (coloured filled squares between pairs of axes)
    local plH = GIZMO_PLANE_SZ / 2
    for _, pl in ipairs(GIZMO_PLANES) do
        local a1 = GIZMO_AXES[pl.i1]
        local a2 = GIZMO_AXES[pl.i2]
        local cx = ox + (a1.dx + a2.dx) * GIZMO_PLANE_OFF
        local cy = oy + (a1.dy + a2.dy) * GIZMO_PLANE_OFF
        local cz = oz + (a1.dz + a2.dz) * GIZMO_PLANE_OFF
        local r, g, b, a = pl.r, pl.g, pl.b, 100
        if gizmoHover == pl.id or gizmoTarget == pl.id then
            r = math.min(255, r + 40)
            g = math.min(255, g + 40)
            b = math.min(255, b + 40)
            a = 180
        end
        local q1x, q1y, q1z = cx + a1.dx*plH + a2.dx*plH, cy + a1.dy*plH + a2.dy*plH, cz + a1.dz*plH + a2.dz*plH
        local q2x, q2y, q2z = cx + a1.dx*plH - a2.dx*plH, cy + a1.dy*plH - a2.dy*plH, cz + a1.dz*plH - a2.dz*plH
        local q3x, q3y, q3z = cx - a1.dx*plH - a2.dx*plH, cy - a1.dy*plH - a2.dy*plH, cz - a1.dz*plH - a2.dz*plH
        local q4x, q4y, q4z = cx - a1.dx*plH + a2.dx*plH, cy - a1.dy*plH + a2.dy*plH, cz - a1.dz*plH + a2.dz*plH
        DrawPoly(q1x, q1y, q1z, q2x, q2y, q2z, q3x, q3y, q3z, r, g, b, a)
        DrawPoly(q1x, q1y, q1z, q3x, q3y, q3z, q2x, q2y, q2z, r, g, b, a)
        DrawPoly(q1x, q1y, q1z, q3x, q3y, q3z, q4x, q4y, q4z, r, g, b, a)
        DrawPoly(q1x, q1y, q1z, q4x, q4y, q4z, q3x, q3y, q3z, r, g, b, a)
        DrawLine(q1x, q1y, q1z, q2x, q2y, q2z, r, g, b, a)
        DrawLine(q2x, q2y, q2z, q3x, q3y, q3z, r, g, b, a)
        DrawLine(q3x, q3y, q3z, q4x, q4y, q4z, r, g, b, a)
        DrawLine(q4x, q4y, q4z, q1x, q1y, q1z, r, g, b, a)
    end
end

-- Determine which gizmo element the screen centre is closest to.
local function updateGizmoHover(ox, oy, oz)
    if gizmoDragging then return end
    gizmoHover = nil
    local best = GIZMO_HIT_RADIUS
    for _, ax in ipairs(GIZMO_AXES) do
        local ok, sx, sy = GetScreenCoordFromWorldCoord(
            ox + ax.dx * GIZMO_LEN, oy + ax.dy * GIZMO_LEN, oz + ax.dz * GIZMO_LEN)
        if ok then
            local d = math.sqrt((sx - 0.5) * (sx - 0.5) + (sy - 0.5) * (sy - 0.5))
            if d < best then best = d; gizmoHover = ax.id end
        end
    end
    for _, pl in ipairs(GIZMO_PLANES) do
        local a1 = GIZMO_AXES[pl.i1]
        local a2 = GIZMO_AXES[pl.i2]
        local ok, sx, sy = GetScreenCoordFromWorldCoord(
            ox + (a1.dx + a2.dx) * GIZMO_PLANE_OFF,
            oy + (a1.dy + a2.dy) * GIZMO_PLANE_OFF,
            oz + (a1.dz + a2.dz) * GIZMO_PLANE_OFF)
        if ok then
            local d = math.sqrt((sx - 0.5) * (sx - 0.5) + (sy - 0.5) * (sy - 0.5))
            if d < best then best = d; gizmoHover = pl.id end
        end
    end
end

-- Apply mouse drag delta to prop position along the active gizmo axis/plane.
local function applyGizmoDrag(rawMX, rawMY, px, py, pz, sens)
    if not gizmoTarget then return px, py, pz end
    local axes = {}
    if #gizmoTarget == 1 then
        for _, ax in ipairs(GIZMO_AXES) do
            if ax.id == gizmoTarget then axes[#axes + 1] = ax end
        end
    else
        for _, pl in ipairs(GIZMO_PLANES) do
            if pl.id == gizmoTarget then
                axes[#axes + 1] = GIZMO_AXES[pl.i1]
                axes[#axes + 1] = GIZMO_AXES[pl.i2]
            end
        end
    end
    for _, ax in ipairs(axes) do
        local ok1, sx1, sy1 = GetScreenCoordFromWorldCoord(px, py, pz)
        local ok2, sx2, sy2 = GetScreenCoordFromWorldCoord(
            px + ax.dx * 0.5, py + ax.dy * 0.5, pz + ax.dz * 0.5)
        if ok1 and ok2 then
            local adx = sx2 - sx1
            local ady = sy2 - sy1
            local alen = math.sqrt(adx * adx + ady * ady)
            if alen > 0.001 then
                adx, ady = adx / alen, ady / alen
                local proj = rawMX * adx + rawMY * ady
                px = px + ax.dx * proj * sens
                py = py + ax.dy * proj * sens
                pz = pz + ax.dz * proj * sens
            end
        end
    end
    return px, py, pz
end

-- Thin crosshair at screen centre (aim at gizmo elements to interact).
local function drawCrosshair()
    DrawRect(0.5, 0.5, 0.012, 0.0015, 255, 255, 255, 160)
    DrawRect(0.5, 0.5, 0.0015, 0.012, 255, 255, 255, 160)
    DrawRect(0.5, 0.5, 0.003, 0.003, 255, 255, 255, 220)
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

local function stopPlacement(commit)
    if not placementActive then return end
    placementActive = false
    gizmoDragging = false
    gizmoTarget = nil
    gizmoHover = nil

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
    gizmoDragging = false
    gizmoTarget = nil
    gizmoHover = nil

    CreateThread(function()
        while placementActive do
            DisableAllControlActions(0)

            local rawMouseX = GetDisabledControlNormal(0, 1)
            local rawMouseY = GetDisabledControlNormal(0, 2)

            -- ---- Camera rotation (suppressed while dragging gizmo) ----
            if not gizmoDragging then
                camYaw   = camYaw   - rawMouseX * 8.0
                camPitch = camPitch - rawMouseY * 8.0
                if camPitch >  89.0 then camPitch =  89.0 end
                if camPitch < -89.0 then camPitch = -89.0 end
            end

            -- ---- WASD camera movement (always active) ----
            local fast  = IsDisabledControlPressed(0, 21) -- Left Shift
            local speed = fast and 0.6 or 0.15
            local yawRad   = math.rad(camYaw)
            local pitchRad = math.rad(camPitch)
            local fx = -math.sin(yawRad) * math.cos(pitchRad)
            local fy =  math.cos(yawRad) * math.cos(pitchRad)
            local fz =  math.sin(pitchRad)
            local rx =  math.cos(yawRad)
            local ry =  math.sin(yawRad)

            if IsDisabledControlPressed(0, 32) then camX = camX + fx*speed; camY = camY + fy*speed; camZ = camZ + fz*speed end
            if IsDisabledControlPressed(0, 33) then camX = camX - fx*speed; camY = camY - fy*speed; camZ = camZ - fz*speed end
            if IsDisabledControlPressed(0, 34) then camX = camX - rx*speed; camY = camY - ry*speed end
            if IsDisabledControlPressed(0, 35) then camX = camX + rx*speed; camY = camY + ry*speed end
            if IsDisabledControlPressed(0, 22) then camZ = camZ + speed end
            if IsDisabledControlPressed(0, 36) then camZ = camZ - speed end

            SetCamCoord(placementCam, camX, camY, camZ)
            SetCamRot(placementCam, camPitch, 0.0, camYaw, 2)

            -- ---- Prop transform ----
            local gizmoJustReleased = false
            if DoesEntityExist(placementProp) then
                local pc  = GetEntityCoords(placementProp)
                local px, py, pz = pc.x, pc.y, pc.z
                local rot = GetEntityRotation(placementProp, 2)
                local propYaw  = rot.z
                local propStep = fast and 0.25 or 0.05
                local rotStep  = fast and 5.0  or 1.0

                -- Gizmo hover detection (screen-centre vs gizmo elements)
                updateGizmoHover(px, py, pz)

                -- Gizmo mouse interaction (LMB = control 24)
                if IsDisabledControlJustPressed(0, 24) and gizmoHover then
                    gizmoDragging = true
                    gizmoTarget   = gizmoHover
                end
                if gizmoDragging and not IsDisabledControlPressed(0, 24) then
                    gizmoDragging = false
                    gizmoTarget   = nil
                    gizmoJustReleased = true
                end
                if gizmoDragging then
                    local sens = fast and (GIZMO_DRAG_SENS * 3.0) or GIZMO_DRAG_SENS
                    px, py, pz = applyGizmoDrag(rawMouseX, rawMouseY, px, py, pz, sens)
                end

                -- Keyboard prop movement (camera-relative XY)
                local flatLen = math.sqrt(fx * fx + fy * fy)
                local cfx, cfy = 0.0, 1.0
                if flatLen > 0.001 then cfx, cfy = fx / flatLen, fy / flatLen end
                local crx, cry = cfy, -cfx

                if IsDisabledControlPressed(0, 172) then px = px + cfx * propStep; py = py + cfy * propStep end
                if IsDisabledControlPressed(0, 173) then px = px - cfx * propStep; py = py - cfy * propStep end
                if IsDisabledControlPressed(0, 174) then px = px - crx * propStep; py = py - cry * propStep end
                if IsDisabledControlPressed(0, 175) then px = px + crx * propStep; py = py + cry * propStep end
                if IsDisabledControlPressed(0, 10)  then pz = pz + propStep end
                if IsDisabledControlPressed(0, 11)  then pz = pz - propStep end
                if IsDisabledControlPressed(0, 44)  then propYaw = propYaw - rotStep end
                if IsDisabledControlPressed(0, 38)  then propYaw = propYaw + rotStep end

                SetEntityCoordsNoOffset(placementProp, px, py, pz, false, false, false)
                SetEntityRotation(placementProp, 0.0, 0.0, propYaw, 2, true)

                -- Draw the 3D gizmo
                drawGizmo(px, py, pz)
            end

            -- ---- Crosshair + HUD hints ----
            drawCrosshair()
            drawHudLine(0.02, 0.02,  '~y~DEPOSIT PLACEMENT EDITOR')
            drawHudLine(0.02, 0.055, '~w~' .. (pendingCreate and pendingCreate.label or '?'))
            drawHudLine(0.02, 0.85,  '~b~WASD~w~ fly cam   ~b~SPACE/CTRL~w~ up/down   ~b~MOUSE~w~ look')
            drawHudLine(0.02, 0.875, '~b~ARROWS~w~ move prop   ~b~PGUP/PGDN~w~ height   ~b~Q/E~w~ rotate')
            drawHudLine(0.02, 0.9,   '~b~LMB~w~ drag gizmo   ~b~SHIFT~w~ faster   ~g~ENTER~w~ confirm   ~r~BACKSPACE~w~ cancel')

            HideHudAndRadarThisFrame()

            -- ---- Confirm / Cancel ----
            -- INPUT_ENTER (18) is also bound to LMB in GTA V, so skip
            -- confirmation on the same frame the gizmo drag was released.
            if not gizmoJustReleased and IsDisabledControlJustReleased(0, 18) then -- Enter
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
