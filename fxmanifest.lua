fx_version 'cerulean'
game 'gta5'

name 'cnbt-inventory'
description 'Tetris-style grid inventory system for ESX'
author 'CNBT'
version '1.0.0'

lua54 'yes'

shared_scripts {
    '@es_extended/imports.lua',
    '@oxmysql/lib/MySQL.lua',
    'config.lua',
    'items.lua',
}

client_scripts {
    'client/main.lua',
    'client/drops.lua',
    'client/gunsmith.lua',
}

server_scripts {
    'server/main.lua',
    'server/api.lua',
    'server/drops.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/css/style.css',
    'html/js/grid.js',
    'html/js/drag.js',
    'html/js/gunsmith.js',
    'html/js/app.js',
    'html/img/*.png',
}

dependencies {
    'es_extended',
    'oxmysql',
}
