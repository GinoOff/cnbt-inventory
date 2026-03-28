CREATE TABLE IF NOT EXISTS `cnbt_inventories` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `owner` VARCHAR(100) NOT NULL,
    `inv_type` VARCHAR(50) NOT NULL DEFAULT 'player',
    `items` LONGTEXT DEFAULT '[]',
    `backpack` LONGTEXT DEFAULT NULL,
    `hotbar` LONGTEXT DEFAULT '[]',
    PRIMARY KEY (`id`),
    UNIQUE KEY `owner_type` (`owner`, `inv_type`),
    INDEX `idx_owner` (`owner`),
    INDEX `idx_type` (`inv_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- items JSON format:
-- [{"name":"water","x":0,"y":0,"rotated":false,"count":2,"metadata":{}}]
--
-- backpack JSON format (item placed in backpack slot):
-- {"name":"backpack_medium","metadata":{},"items":[...]}
--
-- hotbar JSON format:
-- [{"slot":1,"itemRef":{"name":"bandage","x":0,"y":0,"grid":"player"}}, ...]
