var Drone = require('drone');
var dungeon = require('../drone-dungeon')();
var EventDispatcher = require('../event-dispatcher');
var randomInt = require('../drone-dungeon/utils').randomInt;
var BoxInfo = require('../drone-dungeon/utils').BoxInfo;
var serializeLocation = require('../drone-dungeon/utils').serializeLocation;
var deserializeLocation = require('../drone-dungeon/utils').deserializeLocation;
var entities = require('entities');
var spawn = require('spawn');
var utils = require('utils');
var items = require('items');
var DungeonMaker = require('drone-dungeon/dungeon-maker');

/**
 * Constructs a CellarDweller instance
 * @constructor
 * @param {org.bukkit.Location} location - The location to build the dungeon.
 * @param {number} width - The width of the dungeon layout
 * @param {number} height - The height of the dungeon layout
 * @param {Object} options - Optional parameters
 * @param {number} options.nFloors - The number of floors in the dungeon
 * @param {number} options.depth - The depth (height) of each floor
 * @param {string} options.difficulty - The difficulty level - options are 'easy', 'medium', 'difficult', and 'insane'
 * @param {number} options.iterations - The number of iterations for generating the BSP layout - default is 4
 * @param {org.bukkit.Material} options.blockType - The type of block to use to build the dungeon - default is stone
 * @param {DungeonMaker.DOORTYPE} options.doorType - the type of door to use on the dungeons. Options are 'door', 'door2', 'iron', 'door2_iron', and 'random' - default is 'random'
 * @param {DungeonMaker.LIGHTMODE} options.lightMode - the type of lighting - options are 'dark', 'dim', 'medium', and 'bright' - default is medium
 */
var CellarDweller = function(name, location, w, h, options) {
  this.name = name;
  this.location = location;
  this.w = w;
	this.h = h;
  var UUID = Java.type("java.util.UUID");
  this.uuid = UUID.randomUUID().toString();
	this.options = options;
  this.boxInfo = new BoxInfo(location, w, h);
  this.floors = [];
  this.nFloors = (options.nFloors !== undefined) ? options.nFloors : 1;
  this.depth = (options.depth !== undefined) ? options.depth : 5;
  this.totalDepth = this.nFloors * (this.depth + 2);
  var difficulty = (options.difficulty !== undefined) ? options.difficulty : 'medium';
  var userDifficulty = CellarDweller.DIFFICULTY[difficulty];
  this.difficulty = (userDifficulty !== undefined) ? userDifficulty : CellarDweller.DIFFICULTY.medium;
  this.itemDifficulty = invertDifficulty(difficulty);
  this.totalMonsters = null;
  this.playerData = {};
  this.initEvents();
}

/**
* CellarDweller difficulty options
* @readonly
* @enum {number}
*/
CellarDweller.DIFFICULTY = {
	easy: 0.25, // 1/8 of the max value
	medium: 0.5, // 1/2 of the max value
  difficult: 0.75, // 3/4 of the max value
  insane: 1 // The max value
}

/**
* CellarDweller monster array
* @readonly
* @static
*/
CellarDweller.MONSTERS = [
  entities.blaze(),
  entities.cave_spider(),
];

/**
* CellarDweller loot array
* @readonly
* @static
*/
CellarDweller.LOOT = [
  items.bakedPotato(1),
  items.chainmailHelmet(1),
];

CellarDweller.DATA_STORE = 'scriptcraft/data/cellar-dweller-data.json';

CellarDweller.prototype.makeDungeons = function() {
  for (var i = 0; i < this.nFloors; i++) {
    var currentLocation = {
      x: this.location.x,
      y: this.location.y + ((this.depth + 2) * i),
      z: this.location.z,
    }
    var drone = new Drone(this.location);
    var isTopFloor = i === this.nFloors - 1;
    drone.dungeon(this.w, this.h, { depth: this.depth, isTopFloor: isTopFloor }, currentLocation);
    var floorInfo = {
      rooms: drone.dungeons[0].layout.rooms,
      w: this.w,
      h: this.h,
      location: currentLocation,
    }
    this.floors.push(floorInfo);
  }
}

/**
* Builds a containing fort around the dungeon
*
*/
CellarDweller.prototype.fortify = function() {
  DungeonMaker.fortify(this.location, this.w, this.h, this.totalDepth);
}

/**
* Get an array of objects with information about each floor
* @return {Array} the array of floors
*/
CellarDweller.prototype.getFloors = function() {
	// maybe we just want to provide the location and the rooms?
	return this.floors.map(function(floor) {
		var floorInfo = {};
		// maybe other devs want to keep track of the rooms
		floorInfo.rooms = floor.rooms;
		// or maybe they want to get the location to say, create a custom map
		floorInfo.location = floor.location;
		return floorInfo;
	});
}

/**
* Get a flat array of objects with information about each room in the dungeon
* @return {Array} the array of rooms
*/
CellarDweller.prototype.getRooms = function() {
	return this.floors.reduce(function(accumulator, floor, currentIndex) {
		var modifiedRooms = floor.rooms.map(function(room) {
			room.floorIndex = currentIndex;
			return room;
		});
		return accumulator.concat(modifiedRooms);
  }, []);
}

/**
* Filter all of the rooms in the dungeon based on a callback function
* @param {CellarDweller~filterCallback} callback - The callback that determines what rooms to filter.
*/
CellarDweller.prototype.filterRooms = function(callback) {
  return this.getRooms().filter(callback);
}

/**
* This callback determines which rooms to filter with the filterRooms method
* @callback CellarDweller~filterCallback
* @param {Object} room - A room from the dungeon
* @returns {boolean} - Whether or not the room should be filtered
*/

/**
* Returns a random number of monsters based on world.getMonsterSpawnLimit
* @return {number}
*/
CellarDweller.prototype.getNumberOfEntities = function() {
	var world = self.world;
	var max = world.getMonsterSpawnLimit() * this.difficulty;
	var min = max / 2;
	return randomInt(min, max);
}


CellarDweller.prototype.getNumberOfItems = function() {
	var longest = this.w > this.h ? this.w : this.h;
	var max = Math.floor(longest * this.itemDifficulty);
	var min = max / 2;
	return randomInt(min, max);
}


CellarDweller.prototype.getRandomMonster = function() {
  var monsters = CellarDweller.MONSTERS;
  var index = randomInt(0, monsters.length - 1);
  return monsters[index];
}

CellarDweller.prototype.getRandomItem = function() {
  var loot = CellarDweller.LOOT;
  var index = randomInt(0, loot.length - 1);
  return loot[index];
}

CellarDweller.prototype.spawnRandom = function() {
  var doSpawn = function(placeRandom, total) {
    var currentFloor = 0;
    var hasNext = function() {
      return total > 0;
    }

    var next = function() {
      var world = self.world;
      var point = this.boxInfo.randomPoint(world);
      // account for height of floors
      point.y = this.floors[currentFloor].location.y;
      placeRandom(point);
      total -= 1;
      if (currentFloor === this.floors.length-1) {
        currentFloor = 0;
      } else {
        currentFloor += 1;
      }
    }.bind(this);

    var onDone = function() {
      console.log("successfully spawned");
    }
    utils.nicely(next, hasNext, onDone, 100);
  }.bind(this);

  var totalItems = this.getNumberOfItems();
  var placeItem = function(point) {
    var item = this.getRandomItem();
    self.world.dropItem(point, item);
  }.bind(this);

  this.totalMonsters = this.getNumberOfEntities();
  var placeMonster = function(point) {
    var monster = this.getRandomMonster();
    spawn(monster, point);
  }.bind(this);

  // place all items
  doSpawn(placeItem, totalItems);
  // place all monsters
  doSpawn(placeMonster, this.totalMonsters);
}

function invertDifficulty(level) {
  var keys = Object.getOwnPropertyNames(CellarDweller.DIFFICULTY);
  var values = [];
  for (var key in CellarDweller.DIFFICULTY) {
    values.push(CellarDweller.DIFFICULTY[key]);
  }
  values.reverse();
  var inverted = {};
  keys.forEach(function(key, index) {
    inverted[key] = values[index];
  });
  return inverted[level];
}

/**
* Initializes all internal event handlers for CellarDweller
*/
CellarDweller.prototype.initEvents = function() {
	EventDispatcher.on('entityDeath', this.handleEntityDeath.bind(this));
	EventDispatcher.on('playerPickupItem', this.handlePlayerPickupItem.bind(this));
}

/**
* Event handler for {@link https://hub.spigotmc.org/javadocs/spigot/org/bukkit/event/entity/EntityDeathEvent.html org.bukkit.event.entity.EntityDeathEvent}
* @listens org.bukkit.event~EntityDeathEvent
* @param {Object} event - the EntityDeathEvent
* @fires CellarDweller#MonsterSlay
*/
CellarDweller.prototype.handleEntityDeath = function(event) {
  // figure out if it's a monster
  var entity = event.entity;
  if (entity instanceof Java.type("org.bukkit.entity.Monster")) {
    if (this.boxInfo.containsPoint(entity.location)) {
      this.totalMonsters -= 1;
      var info = {
        entity: entity,
        location: location,
        player: entity.getKiller(),
        monster: entity.name,
      }
      this.updatePlayerData(player.getUniqueId(), {monsters: 1});
      EventDispatcher.dispatch(CellarDweller.MonsterSlayEvent, info);
    }
  }
}

/**
* Event handler for {@link https://hub.spigotmc.org/javadocs/spigot/org/bukkit/event/player/PlayerPickupItemEvent.html org.bukkit.event.player.PlayerPickupItemEvent}
* @listens org.bukkit.event.player~PlayerPickupItemEvent
* @param {Object} event - the PlayerPickupItemEvent
*/

CellarDweller.prototype.handlePlayerPickupItem = function(event) {
  var player = event.player;
	if (this.boxInfo.containsPoint(player.location)) {
    this.totalItems -= 1;
    echo(self, player.name + " picked up a " + event.item.name);
    EventDispatcher.dispatch(CellarDweller.PlayerPickupItemEvent, {items: 1})
  }
}

/**
* Updates a CellarDweller instance's playerData
* @param {string} uuid - the player's uuid
* @param {object} data - the player data we want to update
* @param {number} data.items - how many items to add to a playerData[playeruuid].items
* @param {number} data.monsters - how many slain monsters to add to playerData[playeruuid].monsters
*/
CellarDweller.prototype.updatePlayerData = function(uuid, data) {
  if (this.playerData[uuid] !== undefined) {
		var currentData = this.playerData[uuid];
		// we can iterate over the properties in the data object
		for (var key in data) {
			if (data[key] !== undefined && typeof currentData[key] === number) {
				currentData[key] = currentData[key] + data[key];
			}
		}
	} else {
		// could put some checks here to strictly enforce that data can only contain monster and items properties
		this.playerData[uuid] = data;
	}
}

// Static Methods

/**
* A static method to persist all CellarDweller instances
* @param {CellarDweller} cellarDweller - the CellarDweller instance
* @static
*/
CellarDweller.save = function(cellarDweller) {
  var store = scload(CellarDweller.DATA_STORE);
  if (store === null) store = {};
  // we cant persist any Java objects so we need to construct a location object
  var serializedLocation = serializeLocation(cellarDweller.location);
  cellarDweller.serializedLocation = serializedLocation;
	store[cellarDweller.uuid] = cellarDweller;
  scsave(store, CellarDweller.DATA_STORE);
}

/**
* A static method to load all CellarDweller instances
* @param {string} name - the name of the CellarDweller instance
* @returns {(CellarDweller | null)} - returns the deserialized CellarDweller instance if present in the store, otherwise returns null
* @static
*/
CellarDweller.load = function(name) {
	var store = scload(CellarDweller.DATA_STORE);
	var result = null;
	for (var key in store) {
		var cellarDweller = store[key];
		if (cellarDweller.name === name) {
			result = cellarDweller;
			break;
		}
	}
	if (result === null) {
		return result;
	} else {
    // deserialize location
    var location = deserializeLocation(result.serializedLocation, self.world);
		var cd = new CellarDweller(result.name, location, result.w, result.h, result.options);
    cd.uuid = result.uuid;
    cd.floors = result.floors;
    cd.boxInfo = new BoxInfo(location, result.w, result.h);
    cd.playerInfo = result.playerInfo;
    // Now we have what we need
    return cd;
	}
}


// Events
/**
* Monster Slay event
* @event CellarDweller#MonsterSlayEvent
* @type {object}
* @property {string} monster - the type of monster
* @property {org.bukkit.Entity} entity - the entity info for the monster
* @property {org.bukkit.Location} location - the location of the slaying
* @property {org.bukkit.entity.Player} player - the player that did the slaying
*/
CellarDweller.MonsterSlayEvent = 'MonsterSlayEvent';
CellarDweller.PlayerPickupItemEvent = 'PlayerPickupItemEvent';

function testCellarDweller() {
  var options = {
    difficulty: 'easy',
    nFloors: 1,
  }
  var cd = new CellarDweller('my-cellar-dweller', self.location, 50, 50, options);
  cd.makeDungeons();
  cd.fortify();
  cd.spawnRandom();
  CellarDweller.save(cd);
  var result = CellarDweller.load(cd.name);
}

module.exports = {
  CellarDweller: CellarDweller,
  test: testCellarDweller,
  invertDifficulty: invertDifficulty,
}
