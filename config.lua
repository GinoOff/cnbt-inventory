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

-- ============================================
-- DEPOSIT MANAGER (/depositi) - staff only
-- ============================================
--
-- Which ESX groups can run /depositi to create, edit or remove stashes.
-- The server checks xPlayer.getGroup() against this whitelist.
Config.DepositAdminGroups = {
    ['admin']      = true,
    ['superadmin'] = true,
    ['owner']      = true,
}

-- Distance at which an ox_target zone is considered "near" for stash props.
Config.StashTargetDistance = 2.5

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

-- ============================================
-- CASES (filtered containers)
-- ============================================
--
-- Each case item maps to a grid definition + a filter that restricts
-- which items can be placed inside. Filters can match by:
--   category    = 'medical'       (matches item.category)
--   weaponClass = 'pistol'        (matches item.weaponClass)
Config.Cases = {
    ['case_pistol'] = {
        cols = 4, rows = 3, maxWeight = 5000,
        filter = { weaponClass = 'pistol' },
    },
    ['case_smg'] = {
        cols = 5, rows = 3, maxWeight = 10000,
        filter = { weaponClass = 'smg' },
    },
    ['case_rifle'] = {
        cols = 7, rows = 3, maxWeight = 15000,
        filter = { weaponClass = 'rifle' },
    },
    ['case_sniper'] = {
        cols = 7, rows = 3, maxWeight = 15000,
        filter = { weaponClass = 'sniper' },
    },
    ['case_ammo'] = {
        cols = 4, rows = 4, maxWeight = 10000,
        filter = { category = 'ammo' },
    },
    ['case_medical'] = {
        cols = 4, rows = 4, maxWeight = 8000,
        filter = { category = 'medical' },
    },
    ['case_cooler'] = {
        cols = 4, rows = 3, maxWeight = 8000,
        filter = { category = 'food' },
    },
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
-- UI COLOR PALETTE
-- ============================================
--
-- All values are plain CSS strings (hex, rgb(), rgba()). They are sent to the
-- NUI on open and applied as CSS custom properties on :root, so you can theme
-- the inventory and the gunsmith without touching style.css.
--
-- Change any value here and reload the resource to see the new palette.

Config.Colors = {
    -- Main inventory palette (Tarkov-inspired muted green/gray)
    inventory = {
        bgDark        = 'rgba(22, 27, 25, 0.96)',  -- outer container bg
        bgPanel       = 'rgba(35, 42, 38, 0.97)',  -- panel (locker) background
        bgPanelAlt    = 'rgba(42, 50, 45, 0.95)',  -- inner header / strip
        bgCell        = 'rgba(52, 60, 54, 0.55)',  -- empty grid cell
        bgCellHover   = 'rgba(72, 82, 74, 0.75)',
        bgItem        = 'rgba(46, 54, 49, 0.92)',  -- item tile background
        bgItemHover   = 'rgba(62, 72, 64, 0.96)',
        borderColor   = 'rgba(12, 15, 13, 0.95)',  -- hard dark cell/item borders
        borderAccent  = 'rgba(140, 150, 135, 0.35)',
        accent        = '#c8c8b0',                 -- muted cream/tan
        accentGlow    = 'rgba(200, 200, 176, 0.28)',
        success       = '#8fbf6b',                 -- olive green
        successGlow   = 'rgba(143, 191, 107, 0.35)',
        danger        = '#d45c5c',                 -- desaturated red
        dangerGlow    = 'rgba(212, 92, 92, 0.32)',
        selectColor   = '#e8c978',                 -- dusty amber
        selectGlow    = 'rgba(232, 201, 120, 0.38)',
        textPrimary   = '#d8dcd0',
        textSecondary = '#9aa396',
        textDim       = '#5d6560',
        hotbarBg      = 'rgba(28, 34, 31, 0.92)',
        tooltipBg     = 'rgba(10, 13, 11, 0.97)',
        ctxBg         = 'rgba(20, 24, 22, 0.98)',
    },
    -- Gunsmith-specific palette (tactical orange)
    gunsmith = {
        accent     = '#ff8c1a',
        accentDim  = 'rgba(255, 140, 26, 0.55)',
        accentGlow = 'rgba(255, 140, 26, 0.35)',
        panel      = 'rgba(8, 10, 14, 0.88)',
        line       = 'rgba(255, 255, 255, 0.14)',
    },
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

-- ============================================
-- CLOTHING COMPONENTS (utility panel body SVG toggle)
-- ============================================
--
-- Maps each clickable body zone to a GTA V ped component/prop.
--   type = 'component' uses SetPedComponentVariation / GetPedDrawableVariation
--   type = 'prop'      uses SetPedPropIndex / ClearPedProp
--   id   = GTA component/prop index
--   default = drawable index to set when "removing" (usually 0)

Config.ClothingComponents = {
    hat        = { type = 'prop',      id = 0 },                  -- hats/helmets
    glasses    = { type = 'prop',      id = 1 },                  -- glasses
    ears       = { type = 'prop',      id = 2 },                  -- earpieces
    mask       = { type = 'component', id = 1,  default = 0 },    -- masks
    torso      = { type = 'component', id = 11, default = 15 },   -- jacket/top
    undershirt = { type = 'component', id = 8,  default = 15 },   -- undershirt
    chain      = { type = 'component', id = 7,  default = 0 },    -- necklaces/ties
    gloves     = { type = 'component', id = 3,  default = 15 },   -- torso/gloves
    legs       = { type = 'component', id = 4,  default = 21 },   -- pants
    shoes      = { type = 'component', id = 6,  default = 34 },   -- shoes
}
