--[[
    Item Definitions

    Each item has:
    - label:       Display name
    - description: Tooltip text
    - weight:      Weight in grams
    - sizeX:       Grid width (cells)
    - sizeY:       Grid height (cells)
    - stackable:   Whether items can stack in one slot
    - maxStack:    Maximum stack count (only if stackable)
    - usable:      Whether the item can be "used" (right click -> use)
    - image:       Image filename in html/img/
    - category:    Category for organization
]]

Items = {}

-- ============================================
-- MEDICAL
-- ============================================
Items['bandage'] = {
    label       = 'Bandage',
    description = 'A basic bandage for treating minor wounds.',
    weight      = 200,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 3,
    usable      = true,
    image       = 'bandage.png',
    category    = 'medical',
}

-- Sacche di sangue portatili (cnbt-health): si trascinano sulla barra del
-- sangue del pannello salute per una trasfusione. Il campo `uses` deve
-- combaciare con Config.BloodBags in cnbt-health/config.lua.
Items['lblood'] = {
    label       = 'Sacca di Sangue Grande',
    description = 'Sacca di sangue da 1000 ml. 1 utilizzo.',
    weight      = 800,
    sizeX       = 2,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 1,
    image       = 'lblood.png',
    category    = 'medical',
}

Items['mblood'] = {
    label       = 'Sacca di Sangue Media',
    description = 'Sacca di sangue da 500 ml a utilizzo. 2 utilizzi.',
    weight      = 600,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 2,
    image       = 'mblood.png',
    category    = 'medical',
}

Items['sblood'] = {
    label       = 'Sacca di Sangue Piccola',
    description = 'Sacca di sangue da 250 ml a utilizzo. 3 utilizzi.',
    weight      = 400,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 3,
    image       = 'sblood.png',
    category    = 'medical',
}

Items['surkit'] = {
    label       = 'Surgical Kit',
    description = 'A surgical kit for advanced medical procedures.',
    weight      = 1200,
    sizeX       = 2,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'surkit.png',
    category    = 'medical',
}

-- Stecche (cnbt-health): si usano trascinandole sullo stickman del pannello
-- salute, non dal menu contestuale. Gli usi residui sono in metadata.uses;
-- il campo `uses` qui serve alla NUI per il badge e deve combaciare con
-- Config.Splints in cnbt-health/config.lua.
Items['splint'] = {
    label       = 'Stecca di Base',
    description = 'Stecca per stabilizzare le fratture. 2 utilizzi.',
    weight      = 300,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 2,
    image       = 'splint.png',
    category    = 'medical',
}

Items['splint_advanced'] = {
    label       = 'Stecca Avanzata',
    description = 'Stecca professionale, piu\' rapida da applicare. 4 utilizzi.',
    weight      = 600,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 4,
    image       = 'splint_advanced.png',
    category    = 'medical',
}

-- Tourniquette (cnbt-health): si trascinano sulla zona che sanguina dello
-- stickman per fermare l'emorragia. Il campo `uses` deve combaciare con
-- Config.Tourniquets in cnbt-health/config.lua.
Items['tourniquet'] = {
    label       = 'Tourniquette Base',
    description = 'Laccio emostatico per fermare le emorragie. 2 utilizzi.',
    weight      = 150,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 2,
    image       = 'tourniquet.png',
    category    = 'medical',
}

Items['tourniquet_advanced'] = {
    label       = 'Tourniquette Avanzata',
    description = 'Laccio emostatico rinforzato, piu\' rapido da applicare. 3 utilizzi.',
    weight      = 200,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 3,
    image       = 'tourniquet_advanced.png',
    category    = 'medical',
}

Items['tourniquet_military'] = {
    label       = 'Tourniquette Militare',
    description = 'Laccio emostatico militare di livello chirurgico. 4 utilizzi.',
    weight      = 250,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    uses        = 4,
    image       = 'tourniquet_military.png',
    category    = 'medical',
}

Items['crp'] = {
    label       = 'CRP Kit',
    description = 'Chest repair kit for critical injuries.',
    weight      = 500,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = true,
    maxStack    = 1,
    usable      = true,
    image       = 'crp.png',
    category    = 'medical',
}

Items['ct'] = {
    label       = 'Chest Tube',
    description = 'A chest tube for treating pneumothorax.',
    weight      = 350,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 4,
    usable      = true,
    image       = 'ct.png',
    category    = 'medical',
}

Items['ibalin'] = {
    label       = 'Ibalin',
    description = 'Pain relief medication.',
    weight      = 100,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 2,
    usable      = true,
    image       = 'ibalin.png',
    category    = 'medical',
}

-- ============================================
-- FOOD & DRINK
-- ============================================
Items['water'] = {
    label       = 'Water',
    description = 'A bottle of fresh water.',
    weight      = 500,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = true,
    maxStack    = 3,
    usable      = true,
    image       = 'water.png',
    category    = 'food',
}

Items['bread'] = {
    label       = 'Bread',
    description = 'A loaf of bread.',
    weight      = 300,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 3,
    usable      = true,
    image       = 'bread.png',
    category    = 'food',
}

Items['energy_drink'] = {
    label       = 'Energy Drink',
    description = 'Gives a temporary stamina boost.',
    weight      = 350,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 5,
    usable      = true,
    image       = 'energy_drink.png',
    category    = 'food',
}

Items['canned_food'] = {
    label       = 'Canned Food',
    description = 'A can of preserved food.',
    weight      = 400,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 4,
    usable      = true,
    image       = 'canned_food.png',
    category    = 'food',
}

-- ============================================
-- WEAPONS & AMMO
-- ============================================
Items['weapon_pistol'] = {
    label       = 'Pistol',
    description = 'A standard 9mm handgun.',
    weight      = 1200,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'weapon_pistol.png',
    category    = 'weapon',
    weaponHash  = 'WEAPON_PISTOL',
    weaponClass = 'pistol',
}

Items['weapon_smg'] = {
    label       = 'SMG',
    description = 'A compact submachine gun.',
    weight      = 2500,
    sizeX       = 3,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'weapon_smg.png',
    category    = 'weapon',
    weaponHash  = 'WEAPON_SMG',
    weaponClass = 'smg',
}

Items['weapon_rifle'] = {
    label       = 'Assault Rifle',
    description = 'A 5.56x45mm assault rifle.',
    weight      = 3500,
    sizeX       = 5,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'weapon_rifle.png',
    category    = 'weapon',
    weaponHash  = 'WEAPON_ASSAULTRIFLE',
    weaponClass = 'rifle',
}

Items['weapon_shotgun'] = {
    label       = 'Shotgun',
    description = 'A 12 gauge pump-action shotgun.',
    weight      = 3800,
    sizeX       = 5,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'weapon_shotgun.png',
    category    = 'weapon',
    weaponHash  = 'WEAPON_PUMPSHOTGUN',
    weaponClass = 'rifle',
}

Items['weapon_knife'] = {
    label       = 'Knife',
    description = 'A sharp combat knife.',
    weight      = 400,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'weapon_knife.png',
    category    = 'weapon',
    weaponHash  = 'WEAPON_KNIFE',
}

Items['ammo_9mm'] = {
    label       = '9mm Ammo',
    description = 'A box of 9mm ammunition.',
    weight      = 300,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 60,
    usable      = false,
    image       = 'ammo_9mm.png',
    category    = 'ammo',
}

Items['ammo_556'] = {
    label       = '5.56x45mm Ammo',
    description = 'A magazine of 5.56x45mm ammunition.',
    weight      = 400,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = true,
    maxStack    = 30,
    usable      = false,
    image       = 'ammo_556.png',
    category    = 'ammo',
}

Items['ammo_12g'] = {
    label       = '12 Gauge Shells',
    description = 'A box of 12 gauge shotgun shells.',
    weight      = 500,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 16,
    usable      = false,
    image       = 'ammo_12g.png',
    category    = 'ammo',
}

-- ============================================
-- WEAPON ATTACHMENTS
-- ============================================
Items['att_suppressor_pistol'] = {
    label       = 'Pistol Suppressor',
    description = 'A threaded suppressor for pistols. Reduces noise and muzzle flash.',
    weight      = 300,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_suppressor_pistol.png',
    category    = 'attachment',
}

Items['att_suppressor_smg'] = {
    label       = 'SMG Suppressor',
    description = 'A compact suppressor designed for submachine guns.',
    weight      = 350,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_suppressor_smg.png',
    category    = 'attachment',
}

Items['att_suppressor_rifle'] = {
    label       = 'Rifle Suppressor',
    description = 'A full-size suppressor for assault rifles.',
    weight      = 400,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_suppressor_rifle.png',
    category    = 'attachment',
}

Items['att_suppressor_shotgun'] = {
    label       = 'Shotgun Suppressor',
    description = 'A heavy-duty suppressor for shotguns.',
    weight      = 450,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_suppressor_shotgun.png',
    category    = 'attachment',
}

Items['att_flashlight'] = {
    label       = 'Tactical Flashlight',
    description = 'A rail-mounted tactical flashlight for any weapon.',
    weight      = 200,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_flashlight.png',
    category    = 'attachment',
}

Items['att_scope_small'] = {
    label       = 'Red Dot Sight',
    description = 'A compact red dot sight for quick target acquisition.',
    weight      = 250,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_scope_small.png',
    category    = 'attachment',
}

Items['att_scope_medium'] = {
    label       = 'ACOG Scope',
    description = 'A medium-range magnified optic for rifles.',
    weight      = 350,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_scope_medium.png',
    category    = 'attachment',
}

Items['att_grip'] = {
    label       = 'Vertical Grip',
    description = 'A vertical foregrip for improved weapon control.',
    weight      = 200,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_grip.png',
    category    = 'attachment',
}

Items['att_extclip_pistol'] = {
    label       = 'Extended Pistol Mag',
    description = 'An extended magazine for pistols. Doubles ammo capacity.',
    weight      = 200,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_extclip_pistol.png',
    category    = 'attachment',
}

Items['att_extclip_smg'] = {
    label       = 'Extended SMG Mag',
    description = 'An extended magazine for submachine guns.',
    weight      = 250,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_extclip_smg.png',
    category    = 'attachment',
}

Items['att_extclip_rifle'] = {
    label       = 'Extended Rifle Mag',
    description = 'An extended magazine for assault rifles.',
    weight      = 300,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_extclip_rifle.png',
    category    = 'attachment',
}

Items['att_barrel_rifle'] = {
    label       = 'Heavy Barrel',
    description = 'A reinforced heavy barrel for improved accuracy and range.',
    weight      = 500,
    sizeX       = 2,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'att_barrel_rifle.png',
    category    = 'attachment',
}

-- ============================================
-- BACKPACKS
-- ============================================
Items['backpack_small'] = {
    label       = 'Small Backpack',
    description = 'A small backpack with limited storage.',
    weight      = 1000,
    sizeX       = 2,
    sizeY       = 3,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'backpack_small.png',
    category    = 'backpack',
}

Items['backpack_medium'] = {
    label       = 'Medium Backpack',
    description = 'A medium-sized backpack with decent storage.',
    weight      = 1500,
    sizeX       = 3,
    sizeY       = 3,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'backpack_medium.png',
    category    = 'backpack',
}

Items['backpack_large'] = {
    label       = 'Large Backpack',
    description = 'A large backpack with plenty of storage.',
    weight      = 2000,
    sizeX       = 3,
    sizeY       = 4,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'backpack_large.png',
    category    = 'backpack',
}

Items['backpack_tactical'] = {
    label       = 'Tactical Backpack',
    description = 'A military-grade tactical backpack.',
    weight      = 2500,
    sizeX       = 3,
    sizeY       = 4,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'backpack_tactical.png',
    category    = 'backpack',
}

-- ============================================
-- TOOLS & MISC
-- ============================================
Items['phone'] = {
    label       = 'Phone',
    description = 'A mobile phone.',
    weight      = 200,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'phone.png',
    category    = 'misc',
}

Items['radio'] = {
    label       = 'Radio',
    description = 'A portable radio for communication.',
    weight      = 500,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'radio.png',
    category    = 'misc',
}

Items['lockpick'] = {
    label       = 'Lockpick',
    description = 'A tool for picking locks.',
    weight      = 150,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = true,
    maxStack    = 5,
    usable      = true,
    image       = 'lockpick.png',
    category    = 'misc',
}

Items['flashlight'] = {
    label       = 'Flashlight',
    description = 'A handheld flashlight.',
    weight      = 300,
    sizeX       = 1,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'flashlight.png',
    category    = 'misc',
}

Items['rope'] = {
    label       = 'Rope',
    description = 'A sturdy rope, useful for various tasks.',
    weight      = 800,
    sizeX       = 2,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'rope.png',
    category    = 'misc',
}

Items['id_card'] = {
    label       = 'ID Card',
    description = 'Your identification card.',
    weight      = 50,
    sizeX       = 1,
    sizeY       = 1,
    stackable   = false,
    maxStack    = 1,
    usable      = true,
    image       = 'id_card.png',
    category    = 'misc',
}

Items['money_bag'] = {
    label       = 'Money Bag',
    description = 'A bag full of cash.',
    weight      = 1000,
    sizeX       = 2,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'money_bag.png',
    category    = 'misc',
}

-- ============================================
-- CASES (filtered containers)
-- ============================================
Items['case_pistol'] = {
    label       = 'Pistol Case',
    description = 'A padded case for storing small firearms.',
    weight      = 600,
    sizeX       = 3,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_pistol.png',
    category    = 'case',
}

Items['case_smg'] = {
    label       = 'SMG Case',
    description = 'A reinforced case for submachine guns.',
    weight      = 900,
    sizeX       = 4,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_smg.png',
    category    = 'case',
}

Items['case_rifle'] = {
    label       = 'Rifle Case',
    description = 'A heavy-duty case for rifles and shotguns.',
    weight      = 1200,
    sizeX       = 5,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_rifle.png',
    category    = 'case',
}

Items['case_sniper'] = {
    label       = 'Sniper Case',
    description = 'A precision case for sniper rifles.',
    weight      = 1400,
    sizeX       = 5,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_sniper.png',
    category    = 'case',
}

Items['case_ammo'] = {
    label       = 'Ammo Case',
    description = 'A sturdy container for storing ammunition.',
    weight      = 800,
    sizeX       = 3,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_ammo.png',
    category    = 'case',
}

Items['case_medical'] = {
    label       = 'First Aid Case',
    description = 'A medical case for storing first aid supplies.',
    weight      = 700,
    sizeX       = 3,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_medical.png',
    category    = 'case',
}

Items['case_cooler'] = {
    label       = 'Cooler',
    description = 'An insulated cooler for food and drinks.',
    weight      = 900,
    sizeX       = 3,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'case_cooler.png',
    category    = 'case',
}

-- ============================================
-- EQUIPMENT (utility panel)
-- ============================================

Items['armor'] = {
    label       = 'Giubbotto Antiproiettile',
    description = 'Armatura protettiva che assorbe i danni',
    weight      = 3500,
    sizeX       = 2,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'armor.png',
    category    = 'armor',
}

Items['parachute'] = {
    label       = 'Paracadute',
    description = 'Paracadute d\'emergenza',
    weight      = 4000,
    sizeX       = 2,
    sizeY       = 2,
    stackable   = false,
    maxStack    = 1,
    usable      = false,
    image       = 'parachute.png',
    category    = 'parachute',
}
