-- ============================================
-- GUNSMITH - Weapon Attachment System
-- Shows the actual GTA V weapon model by placing
-- it in front of the gameplay camera each frame.
-- Player's camera is NEVER touched. A dark NUI
-- backdrop masks the weapon everywhere except
-- inside the gunsmith viewport.
-- ============================================

local gunsmithOpen = false

-- 3D weapon display state
local gunsmithObject = nil
local gunsmithRotating = false
local gunsmithHeading = 0.0
local gunsmithPitch = 0.0
local gunsmithWeaponName = nil
local gunsmithManualRotate = false

-- Distance in front of gameplay camera (meters)
local DISPLAY_DISTANCE = 0.7

-- ============================================
-- HELPERS
-- ============================================

local function RotationToDirection(rot)
    local rz = math.rad(rot.z)
    local rx = math.rad(rot.x)
    local cosRx = math.abs(math.cos(rx))
    return vector3(
        -math.sin(rz) * cosRx,
         math.cos(rz) * cosRx,
         math.sin(rx)
    )
end

-- ============================================
-- WEAPON DISPLAY (in-game 3D model)
-- ============================================

local function cleanupWeaponDisplay()
    gunsmithRotating = false
    gunsmithManualRotate = false

    if gunsmithObject and DoesEntityExist(gunsmithObject) then
        DeleteEntity(gunsmithObject)
        gunsmithObject = nil
    end
end

local function setupWeaponDisplay(weaponName)
    cleanupWeaponDisplay()

    local def = Items[weaponName]
    if not def or not def.weaponHash then return end

    local weapHash = GetHashKey(def.weaponHash)

    -- Request the weapon asset
    RequestWeaponAsset(weapHash, 31, 0)
    local timeout = 0
    while not HasWeaponAssetLoaded(weapHash) and timeout < 50 do
        Wait(100)
        timeout = timeout + 1
    end
    if not HasWeaponAssetLoaded(weapHash) then return end

    -- Initial spawn position: in front of gameplay camera
    local camPos = GetGameplayCamCoord()
    local camRot = GetGameplayCamRot(2)
    local fwd = RotationToDirection(camRot)
    local spawnPos = camPos + fwd * DISPLAY_DISTANCE

    -- Create the weapon as a non-networked object
    gunsmithObject = CreateWeaponObject(
        weapHash, 1,
        spawnPos.x, spawnPos.y, spawnPos.z,
        true, 1.0, 0
    )

    if not gunsmithObject or gunsmithObject == 0 then
        -- Fallback: CreateObject
        RequestModel(weapHash)
        timeout = 0
        while not HasModelLoaded(weapHash) and timeout < 50 do
            Wait(100)
            timeout = timeout + 1
        end
        if HasModelLoaded(weapHash) then
            gunsmithObject = CreateObject(weapHash, spawnPos.x, spawnPos.y, spawnPos.z, false, true, false)
            SetModelAsNoLongerNeeded(weapHash)
        end
    end

    if not gunsmithObject or gunsmithObject == 0 or not DoesEntityExist(gunsmithObject) then
        return
    end

    SetEntityCollision(gunsmithObject, false, false)
    SetEntityAlpha(gunsmithObject, 255, false)
    SetEntityVisible(gunsmithObject, true, false)
    SetEntityInvincible(gunsmithObject, true)
    FreezeEntityPosition(gunsmithObject, true)

    -- Hide from network so other players don't see it floating
    if NetworkGetEntityIsNetworked(gunsmithObject) then
        SetEntityAsMissionEntity(gunsmithObject, true, true)
        NetworkSetEntityInvisibleToNetwork(gunsmithObject, true)
    end

    -- Render thread: keep weapon in front of camera + lights
    gunsmithRotating = true
    gunsmithHeading = 0.0
    gunsmithPitch = 0.0
    Citizen.CreateThread(function()
        while gunsmithRotating do
            if gunsmithObject and DoesEntityExist(gunsmithObject) then
                -- Use final rendered camera for smoothness
                local cPos = GetFinalRenderedCamCoord()
                local cRot = GetFinalRenderedCamRot(2)
                local forward = RotationToDirection(cRot)
                local targetPos = cPos + forward * DISPLAY_DISTANCE

                SetEntityCoordsNoOffset(gunsmithObject, targetPos.x, targetPos.y, targetPos.z, false, false, false)

                -- Auto-rotate when not manually dragging
                if not gunsmithManualRotate then
                    gunsmithHeading = gunsmithHeading + 0.4
                    if gunsmithHeading >= 360.0 then
                        gunsmithHeading = gunsmithHeading - 360.0
                    end
                end

                -- Rotation relative to camera: yaw = cam yaw + heading, pitch = gunsmithPitch
                SetEntityRotation(gunsmithObject, gunsmithPitch, 0.0, cRot.z + gunsmithHeading, 2, true)

                -- Lights near the weapon to make it well-lit regardless of environment
                DrawLightWithRange(targetPos.x, targetPos.y, targetPos.z + 0.2, 255, 255, 255, 2.0, 8.0)
                DrawLightWithRange(targetPos.x - 0.2, targetPos.y, targetPos.z,      200, 220, 255, 1.5, 4.0)
                DrawLightWithRange(targetPos.x + 0.2, targetPos.y, targetPos.z,      255, 220, 200, 1.5, 4.0)
            end

            Wait(0)
        end
    end)
end

-- ============================================
-- OPEN / CLOSE
-- ============================================

function OpenGunsmith(weaponName, itemIndex, gridId, attachments)
    if gunsmithOpen then return end

    local def = Items[weaponName]
    if not def or not def.weaponHash then return end

    local weaponSlots = Config.WeaponAttachments[weaponName]
    if not weaponSlots then
        ESX.ShowNotification('This weapon has no attachment slots')
        return
    end

    gunsmithOpen = true
    gunsmithWeaponName = weaponName

    -- Build slot data for NUI
    local slotData = {}
    local slotLabels = Config.AttachmentSlotLabels or {}
    for slot, compatItems in pairs(weaponSlots) do
        local equipped = attachments and attachments[slot] or nil
        local equippedLabel = nil
        local equippedImage = nil
        if equipped and Items[equipped] then
            equippedLabel = Items[equipped].label
            equippedImage = Items[equipped].image
        end

        local compatList = {}
        for _, attName in ipairs(compatItems) do
            compatList[attName] = true
        end

        slotData[slot] = {
            label = slotLabels[slot] or slot,
            equipped = equipped,
            equippedLabel = equippedLabel,
            equippedImage = equippedImage,
            compatible = compatList,
        }
    end

    -- Setup the in-game weapon model in front of gameplay camera
    setupWeaponDisplay(weaponName)

    -- Apply any pre-existing attachments to the display object
    if attachments then
        for slot, attName in pairs(attachments) do
            if gunsmithObject and DoesEntityExist(gunsmithObject) then
                local compMap = Config.AttachmentComponents[attName]
                if compMap and compMap[weaponName] then
                    local compHash = GetHashKey(compMap[weaponName])
                    GiveWeaponComponentToWeaponObject(gunsmithObject, compHash)
                end
            end
        end
    end

    SendNUIMessage({
        type = 'openGunsmith',
        weaponName = weaponName,
        weaponLabel = def.label,
        weaponImage = def.image,
        weaponCategory = def.category,
        itemIndex = itemIndex,
        gridId = gridId,
        slots = slotData,
        attachments = attachments or {},
    })
end

function CloseGunsmith()
    if not gunsmithOpen then return end
    gunsmithOpen = false
    gunsmithWeaponName = nil

    cleanupWeaponDisplay()
    SendNUIMessage({ type = 'closeGunsmith' })
end

-- ============================================
-- NUI CALLBACKS
-- ============================================

RegisterNUICallback('gunsmithAttach', function(data, cb)
    if not gunsmithOpen then cb('error') return end
    TriggerServerEvent('cnbt-inventory:server:gunsmithAttach', {
        weaponName = data.weaponName,
        weaponItemIndex = data.weaponItemIndex,
        weaponGrid = data.weaponGrid,
        slot = data.slot,
        attachmentName = data.attachmentName,
    })
    cb('ok')
end)

RegisterNUICallback('gunsmithDetach', function(data, cb)
    if not gunsmithOpen then cb('error') return end
    TriggerServerEvent('cnbt-inventory:server:gunsmithDetach', {
        weaponName = data.weaponName,
        weaponItemIndex = data.weaponItemIndex,
        weaponGrid = data.weaponGrid,
        slot = data.slot,
    })
    cb('ok')
end)

RegisterNUICallback('closeGunsmith', function(_, cb)
    CloseGunsmith()
    cb('ok')
end)

-- Mouse drag rotation
RegisterNUICallback('gunsmithDragStart', function(_, cb)
    gunsmithManualRotate = true
    cb('ok')
end)

RegisterNUICallback('gunsmithRotate', function(data, cb)
    local dx = tonumber(data.dx) or 0.0
    local dy = tonumber(data.dy) or 0.0
    gunsmithHeading = (gunsmithHeading + dx * 0.5) % 360.0
    gunsmithPitch = gunsmithPitch + dy * 0.5
    if gunsmithPitch > 60.0 then gunsmithPitch = 60.0 end
    if gunsmithPitch < -60.0 then gunsmithPitch = -60.0 end
    cb('ok')
end)

RegisterNUICallback('gunsmithDragEnd', function(_, cb)
    gunsmithManualRotate = false
    cb('ok')
end)

-- ============================================
-- SERVER RESPONSE HANDLERS
-- ============================================

RegisterNetEvent('cnbt-inventory:client:gunsmithAttachSuccess')
AddEventHandler('cnbt-inventory:client:gunsmithAttachSuccess', function(data)
    -- Apply component to the display object (visual preview)
    if gunsmithObject and DoesEntityExist(gunsmithObject) and gunsmithWeaponName then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[gunsmithWeaponName] then
            local compHash = GetHashKey(compMap[gunsmithWeaponName])
            GiveWeaponComponentToWeaponObject(gunsmithObject, compHash)
        end
    end

    -- Apply to equipped weapon if it matches
    if equippedWeapon and equippedWeapon == Items[data.weaponName].weaponHash then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[data.weaponName] then
            local ped = PlayerPedId()
            local weapHash = GetHashKey(equippedWeapon)
            local compHash = GetHashKey(compMap[data.weaponName])
            GiveWeaponComponentToPed(ped, weapHash, compHash)
        end
    end

    SendNUIMessage({
        type = 'gunsmithAttachSuccess',
        slot = data.slot,
        attachmentName = data.attachmentName,
        updatedAttachments = data.updatedAttachments,
        updatedItems = data.updatedItems,
    })
end)

RegisterNetEvent('cnbt-inventory:client:gunsmithDetachSuccess')
AddEventHandler('cnbt-inventory:client:gunsmithDetachSuccess', function(data)
    -- Remove component from display object (visual preview)
    if gunsmithObject and DoesEntityExist(gunsmithObject) and gunsmithWeaponName then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[gunsmithWeaponName] then
            local compHash = GetHashKey(compMap[gunsmithWeaponName])
            RemoveWeaponComponentFromWeaponObject(gunsmithObject, compHash)
        end
    end

    -- Remove from equipped weapon if it matches
    if equippedWeapon and equippedWeapon == Items[data.weaponName].weaponHash then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[data.weaponName] then
            local ped = PlayerPedId()
            local weapHash = GetHashKey(equippedWeapon)
            local compHash = GetHashKey(compMap[data.weaponName])
            RemoveWeaponComponentFromPed(ped, weapHash, compHash)
        end
    end

    SendNUIMessage({
        type = 'gunsmithDetachSuccess',
        slot = data.slot,
        attachmentName = data.attachmentName,
        updatedAttachments = data.updatedAttachments,
        updatedItems = data.updatedItems,
    })
end)

RegisterNetEvent('cnbt-inventory:client:gunsmithFailed')
AddEventHandler('cnbt-inventory:client:gunsmithFailed', function(reason)
    ESX.ShowNotification('~r~' .. (reason or 'Operation failed'))
end)

-- Server sends back gunsmith data -> open the panel
RegisterNetEvent('cnbt-inventory:client:openGunsmithData')
AddEventHandler('cnbt-inventory:client:openGunsmithData', function(data)
    OpenGunsmith(data.weaponName, data.itemIndex, data.gridId, data.attachments)
end)
