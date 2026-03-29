Config = {}

-- Player inventory grid dimensions
Config.PlayerCols = 7
Config.PlayerRows = 10

-- Maximum weight the player can carry (grams)
Config.MaxWeight = 40000

-- Hotbar slots count
Config.HotbarSlots = 5

-- Vehicle storage dimensions
Config.Vehicles = {
    -- Default for vehicles not listed
    default = {
        glovebox = { cols = 4, rows = 3, maxWeight = 5000 },
        trunk    = { cols = 6, rows = 5, maxWeight = 30000 },
    },
    -- Override per vehicle model
    ['adder']   = {
        glovebox = { cols = 4, rows = 3, maxWeight = 5000 },
        trunk    = { cols = 4, rows = 3, maxWeight = 15000 },
    },
    ['sultan']  = {
        glovebox = { cols = 4, rows = 3, maxWeight = 5000 },
        trunk    = { cols = 7, rows = 5, maxWeight = 35000 },
    },
}

-- Stash defaults
Config.DefaultStashCols = 6
Config.DefaultStashRows = 6
Config.DefaultStashMaxWeight = 50000

-- Ground drop settings
Config.DropDespawnTime = 300 -- seconds
Config.DropMaxDistance = 2.0  -- distance to interact with drops
Config.DropCols = 5
Config.DropRows = 5
Config.DropMaxWeight = 100000

-- Key to open inventory
Config.OpenKey = 'TAB' -- mapped in client

-- Item use cooldown (ms)
Config.UseCooldown = 500

-- Backpack definitions: item name -> extra grid size
Config.Backpacks = {
    ['backpack_small']  = { cols = 4, rows = 4, maxWeight = 10000 },
    ['backpack_medium'] = { cols = 5, rows = 5, maxWeight = 20000 },
    ['backpack_large']  = { cols = 6, rows = 6, maxWeight = 30000 },
    ['backpack_tactical'] = { cols = 7, rows = 6, maxWeight = 40000 },
}

-- Drop bag prop model
Config.DropPropModel = 'prop_cs_rucksack'

-- Item use effects (esx_status integration + custom exports)
-- Each item can define an onUse handler:
--   status = { hunger = amount, thirst = amount, stress = amount }
--   export = { resource = 'resource_name', export = 'exportFunction' }
--   event  = { server = 'event:name' } or { client = 'event:name' }
Config.ItemEffects = {
    ['water'] = {
        status = { thirst = 200000 },
    },
    ['bread'] = {
        status = { hunger = 200000 },
    },
    ['energy_drink'] = {
        status = { thirst = 100000, hunger = 50000 },
    },
    ['canned_food'] = {
        status = { hunger = 300000 },
    },
    ['bandage'] = {
        event = { client = 'cnbt-inventory:client:useBandage' },
    },
    -- Example custom export:
    -- ['phone'] = {
    --     export = { resource = 'gcphone', export = 'togglePhone' },
    -- },
}
