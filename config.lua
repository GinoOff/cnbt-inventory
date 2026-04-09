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

-- ============================================
-- WEAPON ATTACHMENT SYSTEM (Gunsmith)
-- ============================================

-- Attachment slot types
-- Each weapon defines which slots it supports + compatible attachment items per slot
Config.WeaponAttachments = {
    ['weapon_pistol'] = {
        muzzle = { 'att_suppressor_pistol' },
        flashlight = { 'att_flashlight' },
        magazine = { 'att_extclip_pistol' },
    },
    ['weapon_smg'] = {
        muzzle = { 'att_suppressor_smg' },
        optic = { 'att_scope_small' },
        flashlight = { 'att_flashlight' },
        grip = { 'att_grip' },
        magazine = { 'att_extclip_smg' },
    },
    ['weapon_rifle'] = {
        muzzle = { 'att_suppressor_rifle' },
        optic = { 'att_scope_small', 'att_scope_medium' },
        flashlight = { 'att_flashlight' },
        grip = { 'att_grip' },
        magazine = { 'att_extclip_rifle' },
        barrel = { 'att_barrel_rifle' },
    },
    ['weapon_shotgun'] = {
        muzzle = { 'att_suppressor_shotgun' },
        optic = { 'att_scope_small' },
        flashlight = { 'att_flashlight' },
    },
    -- weapon_knife has no attachment slots
}

-- Maps attachment item name -> GTA weapon component hash
-- These are the actual GTA V component hashes applied via GiveWeaponComponentToPed
Config.AttachmentComponents = {
    -- Suppressors
    ['att_suppressor_pistol'] = {
        ['weapon_pistol'] = 'COMPONENT_AT_PI_SUPP_02',
    },
    ['att_suppressor_smg'] = {
        ['weapon_smg'] = 'COMPONENT_AT_AR_SUPP_02',
    },
    ['att_suppressor_rifle'] = {
        ['weapon_rifle'] = 'COMPONENT_AT_AR_SUPP',
    },
    ['att_suppressor_shotgun'] = {
        ['weapon_shotgun'] = 'COMPONENT_AT_SR_SUPP',
    },
    -- Flashlight
    ['att_flashlight'] = {
        ['weapon_pistol'] = 'COMPONENT_AT_PI_FLSH',
        ['weapon_smg'] = 'COMPONENT_AT_AR_FLSH',
        ['weapon_rifle'] = 'COMPONENT_AT_AR_FLSH',
        ['weapon_shotgun'] = 'COMPONENT_AT_AR_FLSH',
    },
    -- Scopes
    ['att_scope_small'] = {
        ['weapon_smg'] = 'COMPONENT_AT_SCOPE_MACRO_02',
        ['weapon_rifle'] = 'COMPONENT_AT_SCOPE_MEDIUM',
        ['weapon_shotgun'] = 'COMPONENT_AT_SCOPE_SMALL',
    },
    ['att_scope_medium'] = {
        ['weapon_rifle'] = 'COMPONENT_AT_SCOPE_LARGE',
    },
    -- Grip
    ['att_grip'] = {
        ['weapon_smg'] = 'COMPONENT_AT_AR_AFGRIP',
        ['weapon_rifle'] = 'COMPONENT_AT_AR_AFGRIP',
    },
    -- Extended clips
    ['att_extclip_pistol'] = {
        ['weapon_pistol'] = 'COMPONENT_PISTOL_CLIP_02',
    },
    ['att_extclip_smg'] = {
        ['weapon_smg'] = 'COMPONENT_SMG_CLIP_02',
    },
    ['att_extclip_rifle'] = {
        ['weapon_rifle'] = 'COMPONENT_ASSAULTRIFLE_CLIP_02',
    },
    -- Barrel
    ['att_barrel_rifle'] = {
        ['weapon_rifle'] = 'COMPONENT_AT_AR_BARREL_02',
    },
}

-- Slot display names and positions (for NUI layout)
Config.AttachmentSlotLabels = {
    muzzle     = 'Muzzle',
    barrel     = 'Barrel',
    optic      = 'Optic',
    flashlight = 'Flashlight',
    grip       = 'Grip',
    magazine   = 'Magazine',
}
