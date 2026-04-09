-- ============================================
-- GUNSMITH - Weapon Attachment System
-- Shows the actual GTA V weapon model via scripted
-- camera. NUI viewport is transparent so the game-
-- rendered weapon is visible through it.
-- ============================================

local gunsmithOpen = false

-- 3D weapon display state
local gunsmithCam = nil
local gunsmithObject = nil
local gunsmithRotating = false
local gunsmithHeading = 0.0
local gunsmithWeaponName = nil

-- Display position (far underground, invisible to others)
local DISPLAY_POS = vector3(0.0, 0.0, -50.0)

-- ============================================
-- WEAPON DISPLAY (in-game 3D model)
-- ============================================

local function cleanupWeaponDisplay()
    gunsmithRotating = false

    if gunsmithCam then
        RenderScriptCams(false, true, 300, true, true)
        SetCamActive(gunsmithCam, false)
        DestroyCam(gunsmithCam, true)
        gunsmithCam = nil
    end

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

    -- Create the weapon as an object using CreateWeaponObject
    -- Parameters: weaponHash, ammoCount, x, y, z, showWorldModel, scale, p7
    gunsmithObject = CreateWeaponObject(weapHash, 1, DISPLAY_POS.x, DISPLAY_POS.y, DISPLAY_POS.z, true, 1.0, 0)

    if not gunsmithObject or gunsmithObject == 0 then
        -- Fallback: try CreateObject with model request
        RequestModel(weapHash)
        timeout = 0
        while not HasModelLoaded(weapHash) and timeout < 50 do
            Wait(100)
            timeout = timeout + 1
        end
        if HasModelLoaded(weapHash) then
            gunsmithObject = CreateObject(weapHash, DISPLAY_POS.x, DISPLAY_POS.y, DISPLAY_POS.z, false, false, false)
            SetModelAsNoLongerNeeded(weapHash)
        end
    end

    if not gunsmithObject or gunsmithObject == 0 or not DoesEntityExist(gunsmithObject) then
        return
    end

    SetEntityCollision(gunsmithObject, false, false)
    FreezeEntityPosition(gunsmithObject, true)
    SetEntityVisible(gunsmithObject, true, false)

    -- Camera setup - position in front of weapon, looking at it
    gunsmithCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(gunsmithCam, DISPLAY_POS.x, DISPLAY_POS.y - 0.40, DISPLAY_POS.z + 0.03)
    PointCamAtEntity(gunsmithCam, gunsmithObject, 0.0, 0.0, 0.0, true)
    SetCamFov(gunsmithCam, 30.0)
    SetCamActive(gunsmithCam, true)
    RenderScriptCams(true, true, 500, true, true)

    -- Start auto-rotate + lighting thread
    gunsmithRotating = true
    gunsmithHeading = 0.0
    Citizen.CreateThread(function()
        while gunsmithRotating do
            gunsmithHeading = gunsmithHeading + 0.3
            if gunsmithHeading >= 360.0 then
                gunsmithHeading = gunsmithHeading - 360.0
            end
            if gunsmithObject and DoesEntityExist(gunsmithObject) then
                SetEntityHeading(gunsmithObject, gunsmithHeading)
            end

            -- Draw lights around the weapon (underground has no ambient light)
            local px, py, pz = DISPLAY_POS.x, DISPLAY_POS.y, DISPLAY_POS.z
            DrawLightWithRange(px, py - 0.3, pz + 0.3, 255, 255, 255, 3.0, 1.0)
            DrawLightWithRange(px + 0.3, py + 0.2, pz + 0.2, 200, 220, 255, 2.0, 0.6)
            DrawLightWithRange(px - 0.3, py + 0.2, pz - 0.1, 180, 200, 255, 2.0, 0.4)

            Wait(0) -- every frame for light rendering
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

    -- Setup the in-game weapon model + camera
    setupWeaponDisplay(weaponName)

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

-- ============================================
-- SERVER RESPONSE HANDLERS
-- ============================================

RegisterNetEvent('cnbt-inventory:client:gunsmithAttachSuccess')
AddEventHandler('cnbt-inventory:client:gunsmithAttachSuccess', function(data)
    -- Apply component to the display object (visual preview)
    if gunsmithObject and DoesEntityExist(gunsmithObject) and gunsmithWeaponName then
        local compMap = Config.AttachmentComponents[data.attachmentName]
        if compMap and compMap[gunsmithWeaponName] then
            local weapHash = GetHashKey(Items[gunsmithWeaponName].weaponHash)
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
