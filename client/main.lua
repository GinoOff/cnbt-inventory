local ESX = exports['es_extended']:getSharedObject()

local isOpen = false
local currentExternal = nil
local lastUseTime = 0
local hotbarPreviewShown = false
local savedClothingState = {} -- saved clothing state for toggle restore

-- ============================================
-- DISABLE GTA WEAPON WHEEL + CONTROL MANAGEMENT
-- ============================================

CreateThread(function()
    while true do
        Wait(0)
        -- Block weapon wheel always
        DisableControlAction(0, 37, true)  -- Weapon wheel (TAB)
        BlockWeaponWheelThisFrame()
        DisableControlAction(0, 157, true) -- Weapon wheel next
        DisableControlAction(0, 158, true) -- Weapon wheel prev
        DisableControlAction(0, 160, true) -- Weapon wheel next (alt)
        DisableControlAction(0, 161, true) -- Weapon wheel prev (alt)
        DisableControlAction(0, 162, true) -- Weapon wheel next (alt2)
        DisableControlAction(0, 163, true) -- Weapon wheel prev (alt2)
        -- Block the number keys from switching weapons (GTA default behavior)
        DisableControlAction(0, 170, true) -- Select weapon slot 1
        DisableControlAction(0, 171, true) -- Select weapon slot 2
        DisableControlAction(0, 172, true) -- Select weapon slot 3
        DisableControlAction(0, 173, true) -- Select weapon slot 4
        DisableControlAction(0, 174, true) -- Select weapon slot 5
        DisableControlAction(0, 175, true) -- Select weapon slot 6

        -- When inventory is open: block actions that conflict with NUI
        if isOpen then
            DisableControlAction(0, 1, true)   -- Mouse look LR (let NUI handle mouse)
            DisableControlAction(0, 2, true)   -- Mouse look UD
            DisableControlAction(0, 24, true)  -- Attack
            DisableControlAction(0, 25, true)  -- Aim
            DisableControlAction(0, 44, true)  -- Cover
            DisableControlAction(0, 50, true)  -- Accurate aim
            DisableControlAction(0, 68, true)  -- Aim (alt)
            DisableControlAction(0, 69, true)  -- Aim (alt2)
            DisableControlAction(0, 70, true)  -- Aim (alt3)
            DisableControlAction(0, 91, true)  -- Passenger aim
            DisableControlAction(0, 92, true)  -- Passenger attack
            DisableControlAction(0, 114, true) -- Fly attack
            DisableControlAction(0, 142, true) -- Melee alt
            DisableControlAction(0, 257, true) -- Attack 2
            DisableControlAction(0, 263, true) -- Melee
            DisableControlAction(0, 264, true) -- Melee alt2
            DisableControlAction(0, 140, true) -- Melee light
            DisableControlAction(0, 141, true) -- Melee heavy
            DisableControlAction(0, 143, true) -- Melee block
        end
    end
end)

-- ============================================
-- OPEN / CLOSE
-- ============================================

local function openInventory(externalData)
    if isOpen then return end
    TriggerServerEvent('cnbt-inventory:server:requestOpen', externalData)
end

local function closeInventory()
    if not isOpen then return end
    isOpen = false
    currentExternal = nil
    -- If the gunsmith was open, clean it up too (deletes the 3D weapon object,
    -- stops the render thread, and re-enables the disabled controls). Without
    -- this the player gets stuck: inventory closes but gunsmith controls stay
    -- disabled and the floating weapon model remains in front of the camera.
    if CloseGunsmith then
        pcall(CloseGunsmith)
    end
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    SendNUIMessage({ type = 'close' })
    TriggerServerEvent('cnbt-inventory:server:closeInventory')
end

-- Server sends back inventory data -> open NUI
RegisterNetEvent('cnbt-inventory:client:openInventory')
AddEventHandler('cnbt-inventory:client:openInventory', function(playerData, externalInv)
    if isOpen then return end
    -- If the read-only hotbar preview is showing, dismiss it first so the
    -- full inventory can take over.
    if hotbarPreviewShown then
        hotbarPreviewShown = false
        SendNUIMessage({ type = 'hideHotbarPreview' })
    end
    isOpen = true
    currentExternal = externalInv

    -- Build item definitions to send to NUI
    local itemDefs = {}
    for name, def in pairs(Items) do
        itemDefs[name] = {
            label = def.label,
            description = def.description,
            weight = def.weight,
            sizeX = def.sizeX,
            sizeY = def.sizeY,
            stackable = def.stackable,
            maxStack = def.maxStack,
            usable = def.usable,
            image = def.image,
            category = def.category,
            weaponHash = def.weaponHash,
            weaponClass = def.weaponClass,
        }
    end

    -- Backpack config
    local backpackConfigs = {}
    for name, bpDef in pairs(Config.Backpacks) do
        backpackConfigs[name] = {
            cols = bpDef.cols,
            rows = bpDef.rows,
            maxWeight = bpDef.maxWeight,
        }
    end

    -- Case config (for NUI filter validation)
    local caseConfigs = {}
    for name, caseDef in pairs(Config.Cases) do
        caseConfigs[name] = {
            cols = caseDef.cols,
            rows = caseDef.rows,
            maxWeight = caseDef.maxWeight,
            filter = caseDef.filter,
        }
    end

    -- Dati del pannello salute (scheda Salute) da cnbt-health, se avviato
    local healthData = nil
    if GetResourceState('cnbt-health') == 'started' then
        local ok, data = pcall(function()
            return exports['cnbt-health']:GetHealthPanelData()
        end)
        if ok then healthData = data end
    end

    SetNuiFocus(true, true)
    SetNuiFocusKeepInput(true) -- allow player to move while inventory is open
    SendNUIMessage({
        type = 'open',
        playerData = playerData,
        externalInv = externalInv,
        itemDefs = itemDefs,
        backpackConfigs = backpackConfigs,
        caseConfigs = caseConfigs,
        hotbarSlots = Config.HotbarSlots,
        colors = Config.Colors,
        healthData = healthData,
    })
end)

-- Force open external (stash/drop/vehicle)
RegisterNetEvent('cnbt-inventory:client:forceOpenExternal')
AddEventHandler('cnbt-inventory:client:forceOpenExternal', function(externalData)
    if isOpen then
        closeInventory()
        Wait(100)
    end
    openInventory(externalData)
end)

-- ============================================
-- KEY BINDS
-- ============================================

-- TAB to open/close inventory
RegisterCommand('+inventory', function()
    if isOpen then
        closeInventory()
    else
        openInventory(nil)
    end
end, false)
RegisterCommand('-inventory', function() end, false)
RegisterKeyMapping('+inventory', 'Open/Close Inventory', 'keyboard', 'TAB')

-- Hotbar keys 1-5: work both when inventory is open and closed
-- When the inventory UI is OPEN, the NUI has the live hotbar state so we route
-- through it for visual feedback. When the UI is CLOSED, we call the server
-- directly - the server has the authoritative hotbar saved in the DB so it can
-- resolve the slot to an item and run the normal use flow without needing NUI.
for i = 1, Config.HotbarSlots do
    RegisterCommand('hotbar_' .. i, function()
        local now = GetGameTimer()
        if now - lastUseTime < Config.UseCooldown then return end
        lastUseTime = now

        if isOpen then
            SendNUIMessage({ type = 'useHotbar', slot = i })
        else
            TriggerServerEvent('cnbt-inventory:server:useHotbarSlot', i)
        end
    end, false)
    RegisterKeyMapping('hotbar_' .. i, 'Hotbar Slot ' .. i, 'keyboard', tostring(i))
end

-- Hotbar preview: press H to toggle a standalone, read-only hotbar overlay so
-- the player can peek at what's assigned to slots 1-5 without opening the
-- full inventory (and without losing mouse/game focus).
local function hideHotbarPreview()
    if not hotbarPreviewShown then return end
    hotbarPreviewShown = false
    SendNUIMessage({ type = 'hideHotbarPreview' })
end

RegisterCommand('+hotbar_view', function()
    -- If the full inventory is open, the hotbar is already visible - no-op.
    if isOpen then return end
    if hotbarPreviewShown then
        hideHotbarPreview()
    else
        hotbarPreviewShown = true
        TriggerServerEvent('cnbt-inventory:server:requestHotbarPreview')
    end
end, false)
RegisterCommand('-hotbar_view', function() end, false)
RegisterKeyMapping('+hotbar_view', 'Show Hotbar Preview', 'keyboard', 'H')

RegisterNetEvent('cnbt-inventory:client:hotbarPreview')
AddEventHandler('cnbt-inventory:client:hotbarPreview', function(data)
    -- If the full inventory opened in the meantime, skip the preview.
    if isOpen or not hotbarPreviewShown then return end
    SendNUIMessage({ type = 'showHotbarPreview', data = data })
end)

-- ============================================
-- NUI CALLBACKS
-- ============================================

RegisterNUICallback('close', function(_, cb)
    closeInventory()
    cb('ok')
end)

RegisterNUICallback('moveItem', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:moveItem', data)
    cb('ok')
end)

RegisterNUICallback('transferItem', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:transferItem', data)
    cb('ok')
end)

RegisterNUICallback('stackItem', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:stackItem', data)
    cb('ok')
end)

RegisterNUICallback('splitStack', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:splitStack', data)
    cb('ok')
end)

RegisterNUICallback('useItem', function(data, cb)
    local now = GetGameTimer()
    if now - lastUseTime < Config.UseCooldown then
        cb('cooldown')
        return
    end
    lastUseTime = now
    TriggerServerEvent('cnbt-inventory:server:useItem', data)
    cb('ok')
end)

RegisterNUICallback('dropItem', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:dropItem', data)
    cb('ok')
end)

RegisterNUICallback('equipBackpack', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:equipBackpack', data)
    cb('ok')
end)

RegisterNUICallback('unequipBackpack', function(_, cb)
    TriggerServerEvent('cnbt-inventory:server:unequipBackpack')
    cb('ok')
end)

RegisterNUICallback('updateHotbar', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:updateHotbar', data.hotbar)
    cb('ok')
end)

RegisterNUICallback('openCase', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:openCase', {
        itemIndex = data.itemIndex,
        grid = data.grid,
    })
    cb('ok')
end)

RegisterNUICallback('openGunsmith', function(data, cb)
    -- Request gunsmith data from server (attachments, available items)
    TriggerServerEvent('cnbt-inventory:server:requestGunsmithData', {
        itemIndex = data.itemIndex,
        gridId = data.gridId,
        weaponName = data.weaponName,
    })
    cb('ok')
end)

RegisterNUICallback('sortInventory', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:sortInventory', data)
    cb('ok')
end)

-- Clothing toggle from the utility panel SVG body figure
RegisterNUICallback('toggleClothing', function(data, cb)
    local component = data.component
    local visible = data.visible
    if not component then cb('ok') return end

    local ped = PlayerPedId()
    local mapping = Config.ClothingComponents and Config.ClothingComponents[component]
    if not mapping then cb('ok') return end

    if visible then
        -- Restore saved clothing variation
        local saved = savedClothingState[component]
        if saved then
            if mapping.type == 'component' then
                SetPedComponentVariation(ped, mapping.id, saved.drawable, saved.texture, 0)
            elseif mapping.type == 'prop' then
                SetPedPropIndex(ped, mapping.id, saved.drawable, saved.texture, true)
            end
        end
    else
        -- Save current and set to default (hidden)
        if mapping.type == 'component' then
            savedClothingState[component] = {
                drawable = GetPedDrawableVariation(ped, mapping.id),
                texture = GetPedTextureVariation(ped, mapping.id),
            }
            SetPedComponentVariation(ped, mapping.id, mapping.default or 0, 0, 0)
        elseif mapping.type == 'prop' then
            savedClothingState[component] = {
                drawable = GetPedPropIndex(ped, mapping.id),
                texture = GetPedPropTextureIndex(ped, mapping.id),
            }
            ClearPedProp(ped, mapping.id)
        end
    end
    cb('ok')
end)

-- Equipment slot (parachute) from utility panel
RegisterNUICallback('equipSlot', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:equipSlot', data)
    cb('ok')
end)

-- Gear (casco / giubbotto) dalla scheda Vestiario
RegisterNUICallback('equipGear', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:equipGear', data)
    cb('ok')
end)

RegisterNUICallback('unequipGear', function(data, cb)
    TriggerServerEvent('cnbt-inventory:server:unequipGear', data)
    cb('ok')
end)

-- Trattamento medico trascinato sullo stickman della scheda Salute:
-- inoltrato a cnbt-health che valida e consuma lato server
RegisterNUICallback('applyHealthTreatment', function(data, cb)
    TriggerEvent('cnbt-health:applyTreatmentRequest', data)
    cb('ok')
end)

RegisterNUICallback('useHotbarItem', function(data, cb)
    local now = GetGameTimer()
    if now - lastUseTime < Config.UseCooldown then
        cb('cooldown')
        return
    end
    lastUseTime = now
    TriggerServerEvent('cnbt-inventory:server:useItem', data)
    cb('ok')
end)

-- ============================================
-- SERVER RESPONSE HANDLERS
-- ============================================

RegisterNetEvent('cnbt-inventory:client:moveSuccess')
AddEventHandler('cnbt-inventory:client:moveSuccess', function(data)
    SendNUIMessage({ type = 'moveSuccess', data = data })
end)

RegisterNetEvent('cnbt-inventory:client:moveFailed')
AddEventHandler('cnbt-inventory:client:moveFailed', function()
    SendNUIMessage({ type = 'moveFailed' })
end)

RegisterNetEvent('cnbt-inventory:client:transferSuccess')
AddEventHandler('cnbt-inventory:client:transferSuccess', function(data)
    SendNUIMessage({ type = 'transferSuccess', data = data })
end)

RegisterNetEvent('cnbt-inventory:client:stackSuccess')
AddEventHandler('cnbt-inventory:client:stackSuccess', function(data)
    SendNUIMessage({ type = 'stackSuccess', data = data })
end)

-- Parachute equip from utility panel (caschi/giubbotti passano da
-- cnbt-clothes tramite gli eventi gear qui sotto)
RegisterNetEvent('cnbt-inventory:client:applyParachute')
AddEventHandler('cnbt-inventory:client:applyParachute', function(item)
    local ped = PlayerPedId()
    GiveWeaponToPed(ped, GetHashKey('GADGET_PARACHUTE'), 1, false, false)
end)

RegisterNetEvent('cnbt-inventory:client:equipSlotSuccess')
AddEventHandler('cnbt-inventory:client:equipSlotSuccess', function(data)
    SendNUIMessage({ type = 'equipSlotSuccess', data = data })
end)

-- Gear (casco / giubbotto) equipaggiato o rimosso
RegisterNetEvent('cnbt-inventory:client:gearEquipped')
AddEventHandler('cnbt-inventory:client:gearEquipped', function(data)
    SendNUIMessage({ type = 'gearEquipped', data = data })
end)

RegisterNetEvent('cnbt-inventory:client:gearUnequipped')
AddEventHandler('cnbt-inventory:client:gearUnequipped', function(data)
    SendNUIMessage({ type = 'gearUnequipped', data = data })
end)

-- ============================================
-- INTEGRAZIONE CNBT-HEALTH (scheda Salute)
-- ============================================

-- Stato salute cambiato (evento locale emesso dal client di cnbt-health):
-- la NUI aggiorna lo stickman e le barre in tempo reale
AddEventHandler('cnbt-health:stateChanged', function(state)
    if not isOpen then return end
    SendNUIMessage({ type = 'healthUpdate', state = state })
end)

-- Esito di un trattamento applicato dallo stickman (progressbar finita):
-- la NUI aggiorna il badge usi dell'item o lo rimuove
AddEventHandler('cnbt-health:treatmentResult', function(result)
    SendNUIMessage({ type = 'treatmentResult', result = result })
end)

RegisterNetEvent('cnbt-inventory:client:splitSuccess')
AddEventHandler('cnbt-inventory:client:splitSuccess', function(data)
    SendNUIMessage({ type = 'splitSuccess', data = data })
end)

-- Track currently equipped weapon from inventory
local equippedWeapon = nil

RegisterNetEvent('cnbt-inventory:client:useSuccess')
AddEventHandler('cnbt-inventory:client:useSuccess', function(data)
    SendNUIMessage({ type = 'useSuccess', data = data })
end)

-- Weapon equip/unequip handler (triggered by server when a weapon item is used)
RegisterNetEvent('cnbt-inventory:client:equipWeapon')
AddEventHandler('cnbt-inventory:client:equipWeapon', function(weaponHash, itemName, weaponAttachments)
    local ped = PlayerPedId()
    local hash = GetHashKey(weaponHash)

    if equippedWeapon == weaponHash then
        -- Already equipped -> unequip (toggle off)
        RemoveWeaponFromPed(ped, hash)
        equippedWeapon = nil
        ESX.ShowNotification('Weapon holstered')
    else
        -- Unequip previous weapon first
        if equippedWeapon then
            RemoveWeaponFromPed(ped, GetHashKey(equippedWeapon))
        end
        -- Equip new weapon
        GiveWeaponToPed(ped, hash, 0, false, true)
        SetCurrentPedWeapon(ped, hash, true)
        equippedWeapon = weaponHash

        -- Apply saved attachments as GTA weapon components
        if weaponAttachments and Config.AttachmentComponents then
            for slot, attName in pairs(weaponAttachments) do
                local compMap = Config.AttachmentComponents[attName]
                if compMap and compMap[itemName] then
                    local compHash = GetHashKey(compMap[itemName])
                    GiveWeaponComponentToPed(ped, hash, compHash)
                end
            end
        end
    end
end)

-- Clean up equipped weapon on resource stop
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    if equippedWeapon then
        local ped = PlayerPedId()
        RemoveWeaponFromPed(ped, GetHashKey(equippedWeapon))
        equippedWeapon = nil
    end
end)

RegisterNetEvent('cnbt-inventory:client:backpackEquipped')
AddEventHandler('cnbt-inventory:client:backpackEquipped', function(backpack, updatedItems)
    SendNUIMessage({ type = 'backpackEquipped', backpack = backpack, updatedItems = updatedItems })
end)

RegisterNetEvent('cnbt-inventory:client:backpackUnequipped')
AddEventHandler('cnbt-inventory:client:backpackUnequipped', function(updatedItems)
    SendNUIMessage({ type = 'backpackUnequipped', updatedItems = updatedItems })
end)

RegisterNetEvent('cnbt-inventory:client:sortComplete')
AddEventHandler('cnbt-inventory:client:sortComplete', function(data)
    SendNUIMessage({ type = 'sortComplete', data = data })
end)

RegisterNetEvent('cnbt-inventory:client:refreshInventory')
AddEventHandler('cnbt-inventory:client:refreshInventory', function()
    if isOpen then
        closeInventory()
        Wait(200)
        openInventory(currentExternal)
    end
end)

-- ============================================
-- VEHICLE INVENTORY
-- ============================================

local function getVehicleModel(vehicle)
    return GetDisplayNameFromVehicleModel(GetEntityModel(vehicle)):lower()
end

local function getVehiclePlate(vehicle)
    return ESX.Math.Trim(GetVehicleNumberPlateText(vehicle))
end

-- Open trunk (player must be near rear of vehicle)
RegisterCommand('trunk', function()
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local vehicle = ESX.Game.GetClosestVehicle(coords)

    if not vehicle or vehicle == 0 then
        ESX.ShowNotification('No vehicle nearby')
        return
    end

    local vehCoords = GetEntityCoords(vehicle)
    if #(coords - vehCoords) > 5.0 then
        ESX.ShowNotification('Too far from vehicle')
        return
    end

    local plate = getVehiclePlate(vehicle)
    local model = getVehicleModel(vehicle)
    local trunkId = 'trunk_' .. plate

    openInventory({
        owner = trunkId,
        invType = 'trunk_' .. model,
        label = 'Trunk - ' .. plate,
    })
end, false)

-- Open glovebox
RegisterCommand('glovebox', function()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)

    if not vehicle or vehicle == 0 then
        ESX.ShowNotification('You must be in a vehicle')
        return
    end

    local plate = getVehiclePlate(vehicle)
    local model = getVehicleModel(vehicle)
    local gloveboxId = 'glovebox_' .. plate

    openInventory({
        owner = gloveboxId,
        invType = 'glovebox_' .. model,
        label = 'Glovebox - ' .. plate,
    })
end, false)

-- ============================================
-- EXPORTS (Client-side)
-- ============================================

exports('OpenInventory', openInventory)
exports('CloseInventory', closeInventory)
exports('IsOpen', function() return isOpen end)

-- Open stash from client
exports('OpenStash', function(stashId, label)
    openInventory({
        owner = stashId,
        invType = 'stash',
        label = label or 'Stash',
    })
end)

-- On player load, request drops
RegisterNetEvent('esx:playerLoaded')
AddEventHandler('esx:playerLoaded', function()
    TriggerServerEvent('cnbt-inventory:server:requestDrops')
end)

-- Also request on resource start
CreateThread(function()
    Wait(1000)
    TriggerServerEvent('cnbt-inventory:server:requestDrops')
end)

print('[cnbt-inventory] Client loaded successfully')
