-- ============================================
-- GUNSMITH - Weapon Attachment Panel
-- Opens as a panel inside the inventory UI.
-- No camera or 3D objects - uses weapon image in NUI.
-- ============================================

local gunsmithOpen = false

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
            compatible = compatList, -- { attName = true } for fast lookup
        }
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
