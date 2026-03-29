-- ============================================
-- GUNSMITH - 3D Weapon Viewer & Attachment System
-- Renders weapon prop in-game with camera, visible through transparent NUI center
-- ============================================

local gunsmithOpen = false
local gunsmithCam = nil
local gunsmithWeaponObj = nil
local gunsmithWeaponName = nil
local gunsmithRotY = 0.0
local gunsmithRotZ = 0.0
local gunsmithDragging = false

-- Spawn position for weapon object (high up, invisible to world)
local GUNSMITH_POS = vector3(0.0, 0.0, 100.0)

-- ============================================
-- OPEN GUNSMITH
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

    gunsmithWeaponName = weaponName
    gunsmithOpen = true
    gunsmithRotY = 0.0
    gunsmithRotZ = 0.0

    -- Request weapon model
    local weaponHash = GetHashKey(def.weaponHash)
    local modelHash = weaponHash

    -- Create weapon object
    RequestWeaponAsset(weaponHash, 31, 0)
    local timeout = 0
    while not HasWeaponAssetLoaded(weaponHash) and timeout < 100 do
        Wait(10)
        timeout = timeout + 1
    end

    -- Use CreateWeaponObject to get proper weapon model
    local ped = PlayerPedId()
    gunsmithWeaponObj = CreateWeaponObject(weaponHash, 1, GUNSMITH_POS.x, GUNSMITH_POS.y, GUNSMITH_POS.z, true, 1.0, 0)

    if not DoesEntityExist(gunsmithWeaponObj) then
        gunsmithOpen = false
        ESX.ShowNotification('Failed to create weapon model')
        return
    end

    FreezeEntityPosition(gunsmithWeaponObj, true)
    SetEntityCollision(gunsmithWeaponObj, false, false)

    -- Apply existing attachments as components on the object
    if attachments then
        for slot, attName in pairs(attachments) do
            local compMap = Config.AttachmentComponents[attName]
            if compMap and compMap[weaponName] then
                local compHash = GetHashKey(compMap[weaponName])
                GiveWeaponComponentToWeaponObject(gunsmithWeaponObj, compHash)
            end
        end
    end

    -- Create camera
    local camPos = vector3(GUNSMITH_POS.x, GUNSMITH_POS.y - Config.Gunsmith.camDist, GUNSMITH_POS.z)
    gunsmithCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(gunsmithCam, camPos.x, camPos.y, camPos.z)
    PointCamAtCoord(gunsmithCam, GUNSMITH_POS.x, GUNSMITH_POS.y, GUNSMITH_POS.z)
    SetCamFov(gunsmithCam, 30.0)
    SetCamActive(gunsmithCam, true)
    RenderScriptCams(true, true, 500, true, false)

    -- Build slot data for NUI
    local slotData = {}
    local slotLabels = Config.AttachmentSlotLabels or {}
    for slot, compatItems in pairs(weaponSlots) do
        local equipped = attachments and attachments[slot] or nil
        local equippedLabel = nil
        if equipped and Items[equipped] then
            equippedLabel = Items[equipped].label
        end
        slotData[slot] = {
            label = slotLabels[slot] or slot,
            equipped = equipped,
            equippedLabel = equippedLabel,
            compatible = {},
        }
        for _, attName in ipairs(compatItems) do
            local attDef = Items[attName]
            if attDef then
                table.insert(slotData[slot].compatible, {
                    name = attName,
                    label = attDef.label,
                    description = attDef.description,
                    image = attDef.image,
                })
            end
        end
    end

    -- Send to NUI
    SendNUIMessage({
        type = 'openGunsmith',
        weaponName = weaponName,
        weaponLabel = def.label,
        weaponImage = def.image,
        itemIndex = itemIndex,
        gridId = gridId,
        slots = slotData,
        attachments = attachments or {},
    })

    -- Rotation loop
    CreateThread(function()
        while gunsmithOpen do
            Wait(0)
            -- Keep disabling controls while gunsmith is open
            DisableControlAction(0, 1, true)
            DisableControlAction(0, 2, true)
            DisableControlAction(0, 24, true)
            DisableControlAction(0, 25, true)
        end
    end)
end

-- ============================================
-- CLOSE GUNSMITH
-- ============================================

function CloseGunsmith()
    if not gunsmithOpen then return end
    gunsmithOpen = false

    -- Cleanup camera
    if gunsmithCam then
        RenderScriptCams(false, true, 500, true, false)
        DestroyCam(gunsmithCam, false)
        gunsmithCam = nil
    end

    -- Cleanup weapon object
    if gunsmithWeaponObj and DoesEntityExist(gunsmithWeaponObj) then
        DeleteObject(gunsmithWeaponObj)
        gunsmithWeaponObj = nil
    end

    gunsmithWeaponName = nil
    gunsmithDragging = false

    SendNUIMessage({ type = 'closeGunsmith' })
end

-- ============================================
-- NUI CALLBACKS
-- ============================================

-- Mouse drag rotation from NUI
RegisterNUICallback('gunsmithRotate', function(data, cb)
    if not gunsmithOpen or not gunsmithWeaponObj or not DoesEntityExist(gunsmithWeaponObj) then
        cb('ok')
        return
    end

    local dx = tonumber(data.dx) or 0.0
    local dy = tonumber(data.dy) or 0.0

    gunsmithRotZ = gunsmithRotZ + dx * Config.Gunsmith.rotSpeed
    gunsmithRotY = gunsmithRotY - dy * Config.Gunsmith.rotSpeed

    -- Clamp vertical rotation
    if gunsmithRotY > 45.0 then gunsmithRotY = 45.0 end
    if gunsmithRotY < -45.0 then gunsmithRotY = -45.0 end

    SetEntityRotation(gunsmithWeaponObj, gunsmithRotY, 0.0, gunsmithRotZ, 2, true)

    cb('ok')
end)

-- Attach an attachment to the weapon
RegisterNUICallback('gunsmithAttach', function(data, cb)
    if not gunsmithOpen then cb('error') return end

    -- data: { weaponName, slot, attachmentName, itemIndex, gridId }
    TriggerServerEvent('cnbt-inventory:server:gunsmithAttach', {
        weaponName = data.weaponName,
        weaponItemIndex = data.weaponItemIndex,
        weaponGrid = data.weaponGrid,
        slot = data.slot,
        attachmentName = data.attachmentName,
    })
    cb('ok')
end)

-- Detach an attachment from the weapon
RegisterNUICallback('gunsmithDetach', function(data, cb)
    if not gunsmithOpen then cb('error') return end

    -- data: { weaponName, slot, weaponItemIndex, weaponGrid }
    TriggerServerEvent('cnbt-inventory:server:gunsmithDetach', {
        weaponName = data.weaponName,
        weaponItemIndex = data.weaponItemIndex,
        weaponGrid = data.weaponGrid,
        slot = data.slot,
    })
    cb('ok')
end)

-- Close gunsmith from NUI
RegisterNUICallback('closeGunsmith', function(_, cb)
    CloseGunsmith()
    cb('ok')
end)

-- ============================================
-- SERVER RESPONSE HANDLERS
-- ============================================

RegisterNetEvent('cnbt-inventory:client:gunsmithAttachSuccess')
AddEventHandler('cnbt-inventory:client:gunsmithAttachSuccess', function(data)
    -- data: { slot, attachmentName, weaponName, updatedAttachments, updatedItems }

    -- Update 3D model: add component
    if gunsmithWeaponObj and DoesEntityExist(gunsmithWeaponObj) then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[data.weaponName] then
            local compHash = GetHashKey(compMap[data.weaponName])
            GiveWeaponComponentToWeaponObject(gunsmithWeaponObj, compHash)
        end
    end

    -- Also apply to equipped weapon if it matches
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
    -- data: { slot, attachmentName, weaponName, updatedAttachments, updatedItems }

    -- Update 3D model: remove component
    if gunsmithWeaponObj and DoesEntityExist(gunsmithWeaponObj) then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[data.weaponName] then
            local compHash = GetHashKey(compMap[data.weaponName])
            RemoveWeaponComponentFromWeaponObject(gunsmithWeaponObj, compHash)
        end
    end

    -- Also remove from equipped weapon if it matches
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

-- Server sends back gunsmith data -> open the gunsmith view
RegisterNetEvent('cnbt-inventory:client:openGunsmithData')
AddEventHandler('cnbt-inventory:client:openGunsmithData', function(data)
    OpenGunsmith(data.weaponName, data.itemIndex, data.gridId, data.attachments)
end)

-- Cleanup on resource stop
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if gunsmithOpen then
        CloseGunsmith()
    end
end)
