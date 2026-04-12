-- ============================================
-- cnbt-inventory - INVENTORY MANAGER (client)
-- ============================================
--
-- Opens the admin inventory browser NUI when /inventari is executed.

RegisterCommand('inventari', function()
    TriggerServerEvent('cnbt-inventory:inventories:openManager')
end, false)

RegisterNetEvent('cnbt-inventory:inventories:managerData')
AddEventHandler('cnbt-inventory:inventories:managerData', function(list)
    SetNuiFocus(true, true)
    SendNUIMessage({ type = 'openInventoryManager', inventories = list or {} })
end)

RegisterNetEvent('cnbt-inventory:inventories:detailData')
AddEventHandler('cnbt-inventory:inventories:detailData', function(detail)
    SendNUIMessage({ type = 'inventoryDetail', detail = detail })
end)

RegisterNetEvent('cnbt-inventory:inventories:deleteItemSuccess')
AddEventHandler('cnbt-inventory:inventories:deleteItemSuccess', function(data)
    SendNUIMessage({ type = 'inventoryDeleteItemSuccess', data = data })
end)

RegisterNetEvent('cnbt-inventory:inventories:clearSuccess')
AddEventHandler('cnbt-inventory:inventories:clearSuccess', function(data)
    SendNUIMessage({ type = 'inventoryClearSuccess', data = data })
end)

RegisterNUICallback('closeInventoryManager', function(_, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('viewInventoryDetail', function(data, cb)
    TriggerServerEvent('cnbt-inventory:inventories:viewDetail', data)
    cb('ok')
end)

RegisterNUICallback('deleteInventoryItem', function(data, cb)
    TriggerServerEvent('cnbt-inventory:inventories:deleteItem', data)
    cb('ok')
end)

RegisterNUICallback('clearInventory', function(data, cb)
    TriggerServerEvent('cnbt-inventory:inventories:clearInventory', data)
    cb('ok')
end)
