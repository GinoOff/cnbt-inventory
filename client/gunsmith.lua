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

local function setupWeaponDisplay(weaponName)
    local def = Items[weaponName]
    if not def or not def.weaponHash then return end

    local weapHash = GetHashKey(def.weaponHash)

    -- Request the weapon model
    RequestWeaponAsset(weapHash, 31, 0)
    local timeout = 0
    while not HasWeaponAssetLoaded(weapHash) and timeout < 50 do
        Wait(100)
        timeout = timeout + 1
    end
    if not HasWeaponAssetLoaded(weapHash) then return end

    -- Also request as regular model for CreateObject
    RequestModel(weapHash)
    timeout = 0
    while not HasModelLoaded(weapHash) and timeout < 50 do
        Wait(100)
        timeout = timeout + 1
    end
    if not HasModelLoaded(weapHash) then return end

    -- Create the weapon object
    gunsmithObject = CreateObject(weapHash, DISPLAY_POS.x, DISPLAY_POS.y, DISPLAY_POS.z, false, false, false)
    SetEntityCollision(gunsmithObject, false, false)
    FreezeEntityPosition(gunsmithObject, true)
    SetEntityVisible(gunsmithObject, true, false)
    SetEntityAlpha(gunsmithObject, 255, false)

    SetModelAsNoLongerNeeded(weapHash)

    -- Camera setup - position slightly in front and above
    gunsmithCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
    SetCamCoord(gunsmithCam, DISPLAY_POS.x, DISPLAY_POS.y - 0.35, DISPLAY_POS.z + 0.05)
    PointCamAtEntity(gunsmithCam, gunsmithObject, 0.0, 0.0, 0.0, true)
    SetCamFov(gunsmithCam, 35.0)
    SetCamActive(gunsmithCam, true)
    RenderScriptCams(true, true, 300, true, true)

    -- Apply existing attachments to the display object
    if gunsmithWeaponName then
        local currentAtts = {} -- will be applied via server data
    end

    -- Start auto-rotate
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
            Wait(16) -- ~60fps
        end
    end)
end

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
