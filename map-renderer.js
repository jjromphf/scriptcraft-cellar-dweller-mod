var MapRenderer = Java.type('org.bukkit.map.MapRenderer');

var DungeonMap = Java.extend(MapRenderer, {
  render: function(map, canvas, player) {
    // use canvas to draw pixels here
    Java.super(DungeonMap).render(map, canvas, player);
  },
});

module.exports = {
  DungeonMap: DungeonMap,
}
