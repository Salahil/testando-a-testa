import { BlockPermutation, EquipmentSlot, GameMode, ItemStack, MolangVariableMap, Player, system, world } from "@minecraft/server";
import { BedrockMod } from "./BedrockMod";
import { CoroUtil, debug, err, log } from "./util";
import { MODID, biome_themes_from_biome, biome_themes_to_waystone, blocks_allowed_to_gen_over, elevators, solid_ground_blocks_to_gen_on, waystones } from "./SharedConstants";
import { ActionFormData } from "@minecraft/server-ui";
import { ticksSinceModInit } from "./main";
// [PATCH Clebao] Antes, o tick gravava estas propriedades em cada jogador a cada tick/5 ticks
// mesmo sem mudanca (cada gravacao serializa e marca o jogador como alterado para salvar).
// Agora so grava quando o valor realmente muda. O comportamento e o mesmo.
function setPropIfChanged(entity, key, value) {
  if (entity.getDynamicProperty(key) !== value) entity.setDynamicProperty(key, value);
}
class PlayerData {
  constructor() {
    this.wasSneaking = false;
    this.wasOnGround = true;
  }
}
class ExplorersWayStones extends BedrockMod {
  constructor(dbName) {
    super(dbName);
    this.playerToData = /* @__PURE__ */ new Map();
    this.blockNameElevatorBase = MODID + ":elevator_";
    this.blockNameWaystone = MODID + ":waystone";
    this.blockNameWaystoneMasterFull = MODID + ":waystone_master_full";
    this.blockNameWaystoneMasterBase = MODID + ":waystone_master_base";
    this.blockNameWaystoneMasterTop = MODID + ":waystone_master_top";
    this.itemNameWayfinderSimple = MODID + ":wayfinder_simple";
    this.itemNameWayfinderClairvoyant = MODID + ":wayfinder_clairvoyant";
    this.itemNameWayfinderWildcard = MODID + ":wayfinder_wildcard";
    this.itemNameWayfinderEcho = MODID + ":wayfinder_echo";
    this.itemNameDevTool = MODID + ":dev_tool";
    this.entityNameWaystoneMasterData = MODID + ":master_waystone_data";
    this.entityNameWaystoneMasterMenu = MODID + ":master_waystone_menu";
    this.entityNameWaystoneMasterMenuDestination = MODID + ":master_waystone_menu_destination";
    this.entityNameWayfinder = MODID + ":wayfinder";
    this.blockPermutationMasterWaystoneActivated = MODID + ":activated";
    this.blockPermutationMasterWaystoneWayfinderCount = MODID + ":wayfinder_count";
    this.propMasterWaystoneDataMenuEntID = "menu_ent_id";
    this.propMasterWaystoneDataMenuDestinationEntIDs = "menu_dest_ent_ids";
    this.propDataEntID = "data_ent_id";
    this.propMenuDataDestinationIndex = "dest_index";
    this.propWayfinderEntityData = "wayfinder_data";
    this.propPlayerLowSpeedTicks = MODID + ":low_speed_ticks";
    this.propPlayerUsingWayfinderTicks = MODID + ":using_wayfinder_ticks";
    this.propPlayerIsUsingWayfinder = MODID + ":using_wayfinder";
    this.propPlayerIsUsingLecternWayfinder = MODID + ":using_lectern_wayfinder";
    this.propPlayerLastItemInHandID = MODID + ":last_item_in_hand_id";
    this.propPlayerLastItemInHandLoreFirstLine = MODID + ":last_item_in_hand_lore";
    this.propPlayerTitleTimes = MODID + ":title_times";
    this.propPlayerWayfinderUseCooldown = MODID + ":wayfinder_use_cooldown";
    this.propPlayerLastWaystoneTPPos = MODID + ":wayfinder_last_tp_pos";
    this.propPlayerLastWaystoneTPDim = MODID + ":wayfinder_last_tp_dim";
    this.propPlayerItemWasUsedOnBlock = MODID + ":item_was_used_on_block";
    this.propGennedWaystonePrefix = MODID + ":genned_waystone_";
    this.propGennedWaystoneCavePrefix = MODID + ":genned_waystone_cave_";
    this.propWaystoneDimPosPrefix = MODID + ":dimpos_waystone_";
    this.propWaystoneLocations = MODID + ":waystone_locations";
    this.propConfigLoggingDebug = MODID + ":config_logging_debug";
    this.propConfigLoggingLog = MODID + ":config_logging_log";
    this.propConfigLoggingError = MODID + ":config_logging_error";
    this.propConfigElevatorSearchDist = MODID + ":config_elevator_search_dist";
    this.propConfigTimesPerIterationToFindGoodXZPosSurface = MODID + ":config_surface_gen_tries";
    this.propConfigTimesPerIterationToFindGoodXZPosCave = MODID + ":config_cave_gen_tries";
    this.propConfigMaxScanDownDistanceFromPosCave = MODID + ":config_cave_gen_scan_dist_y";
    this.propConfigMasterWaystonePistonNoise = MODID + ":config_master_waystone_piston_noise";
    this.propConfigSceneTest = MODID + ":config_scene_test";
    this.rotTest = 0;
    this.waystoneRegionSize = 512;
    this.echoWayfinderFixTempPlayerID = "";
    this.echoWayfinderFixSetLoreDelay = 0;
    this.echoWayfinderFixTempItemStack = void 0;
    this.titleTimesMax = 60;
    this.playerWayfinderUseCooldownMax = 10;
    this.tickGenAlternator = false;
    this.modActive = false;
  }
  getPlayerData(mob) {
    let data = this.playerToData.get(mob.id);
    if (data == null) {
      data = new PlayerData();
      this.playerToData.set(mob.id, data);
    }
    return data;
  }
  getRegionFromPos(pos) {
    return { x: Math.floor(pos.x / this.waystoneRegionSize), y: pos.y, z: Math.floor(pos.z / this.waystoneRegionSize) };
  }
  processConfigSetting(event, config) {
    if (event.id == config) {
      try {
        if (event.message == "get") {
          CoroUtil.trySendMessage(event.sourceEntity, config + "is currently set to " + world.getDynamicProperty(config));
        } else {
          let value = JSON.parse(event.message);
          if (typeof value === "boolean" || typeof value === "number" || typeof value === "string" || CoroUtil.isVector3(value)) {
            world.setDynamicProperty(config, value);
            CoroUtil.trySendMessage(event.sourceEntity, config + " set to " + world.getDynamicProperty(config));
          } else {
            CoroUtil.trySendMessage(event.sourceEntity, "error setting " + config + " to " + world.getDynamicProperty(config));
          }
        }
      } catch (e) {
        err("error: " + e.message);
        CoroUtil.trySendMessage(event.sourceEntity, "\xA74error setting " + config + " to " + event.message);
      }
    }
  }
  updateRuntimeVarsFromConfigOrSetDefaults() {
    CoroUtil.outputDebug = CoroUtil.getPropBoolOrUndefined(world, this.propConfigLoggingDebug) ?? false;
    CoroUtil.outputLog = CoroUtil.getPropBoolOrUndefined(world, this.propConfigLoggingLog) ?? false;
    CoroUtil.outputError = CoroUtil.getPropBoolOrUndefined(world, this.propConfigLoggingError) ?? false;
    this.configElevatorSearchDist = CoroUtil.getPropNumberOrUndefined(world, this.propConfigElevatorSearchDist) ?? 50;
    this.configTimesPerIterationToFindGoodXZPosSurface = CoroUtil.getPropNumberOrUndefined(world, this.propConfigTimesPerIterationToFindGoodXZPosSurface) ?? 20;
    this.configTimesPerIterationToFindGoodXZPosCave = CoroUtil.getPropNumberOrUndefined(world, this.propConfigTimesPerIterationToFindGoodXZPosCave) ?? 20;
    this.configMaxScanDownDistanceFromPosCave = CoroUtil.getPropNumberOrUndefined(world, this.propConfigMaxScanDownDistanceFromPosCave) ?? 30;
    this.configMasterWaystonePistonNoise = CoroUtil.getPropBoolOrUndefined(world, this.propConfigMasterWaystonePistonNoise) ?? true;
    this.configSceneTest = CoroUtil.getPropBoolOrUndefined(world, this.propConfigSceneTest) ?? false;
  }
  initBootstrap() {
    this.updateRuntimeVarsFromConfigOrSetDefaults();
    system.afterEvents.scriptEventReceive.subscribe((event) => {
      try {
        if (event.id.startsWith(MODID)) {
          this.processConfigSetting(event, this.propConfigLoggingDebug);
          this.processConfigSetting(event, this.propConfigLoggingLog);
          this.processConfigSetting(event, this.propConfigLoggingError);
          this.processConfigSetting(event, this.propConfigElevatorSearchDist);
          this.processConfigSetting(event, this.propConfigMasterWaystonePistonNoise);
          this.processConfigSetting(event, this.propConfigSceneTest);
          this.updateRuntimeVarsFromConfigOrSetDefaults();
          if (event.id == MODID + ":test") {
            if (event.sourceEntity instanceof Player) {
              let player = event.sourceEntity;
              const form = new ActionFormData();
              form.title("Minigames");
              form.body("Choose the games");
              form.button("Spleef", "textures/items/diamond_shovel");
              form.button("Murder Mystery", "textures/items/iron_sword");
              form.button("Bedwars", "textures/minigames/bedwars.png");
              form.show(player).then((response) => {
                if (response.canceled) {
                  player.sendMessage("Canceled due to " + response.cancelationReason);
                }
                if (response.selection == 0) {
                  player.sendMessage("You have selected Spleef");
                }
                if (response.selection == 1) {
                  player.sendMessage("You have selected Murder Mystery");
                }
                if (response.selection == 2) {
                  player.sendMessage("You have selected Bedwars");
                }
                return;
              });
            }
          }
          if (event.id == MODID + ":get_biome" && event.sourceEntity !== void 0) {
            let tryPos = {
              x: event.sourceEntity.location.x,
              y: event.sourceEntity.location.y,
              z: event.sourceEntity.location.z
            };
            var ent = event.sourceEntity.dimension.spawnEntity(MODID + ":biome_getter", {
              x: tryPos.x,
              y: tryPos.y,
              z: tryPos.z
            });
            CoroUtil.despawnEntity(ent);
          }
          if (event.id == MODID + ":reset_all") {
            log("clearDynamicProperties");
            world.clearDynamicProperties();
          }
          if (event.id == MODID + ":init") {
            log("init");
            this.init();
          }
        }
      } catch (e) {
        err(e.message);
      }
    });
  }
  init() {
    super.init();
    if (this.modActive) {
      return;
    }
    this.modActive = true;
    world.afterEvents.dataDrivenEntityTrigger.subscribe((event) => {
      if (event.eventId == "event:on_interact") {
        if (event.entity.typeId == this.entityNameWaystoneMasterMenuDestination) {
          const run = system.run(() => {
            this.interactMasterWaystoneMenuDestination(event.entity);
          });
        } else if (event.entity.typeId == this.entityNameWayfinder) {
          this.turnWayfinderEntityIntoItem(event.entity);
        }
      }
    });
    world.afterEvents.entityHitEntity.subscribe((event) => {
      if (event.hitEntity.typeId == this.entityNameWaystoneMasterMenuDestination) {
        if (event.damagingEntity instanceof Player) {
          this.hitMasterWaystoneMenuDestination(event.hitEntity, event.damagingEntity);
        }
      }
    });
    world.afterEvents.entityHitBlock.subscribe((event) => {
      if (event.damagingEntity instanceof Player) {
      }
    });
    world.beforeEvents.playerBreakBlock.subscribe((event) => {
      if (event.itemStack !== void 0) {
        event.itemStack.getComponents();
      }
      if (this.isElevator(event.block)) {
        const run = system.run(() => {
          this.updateElevatorsActivatedState(event.player.dimension, event.block);
        });
      }
      if (this.isWaystone(event.block)) {
        this.removeWaystoneLocation(event.dimension, event.block);
      }
    });
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
      if (this.isElevator(event.block)) {
        this.updateElevatorsDeactivatedState(event.player.dimension, event.block);
      } else if (event.block.permutation.matches(this.blockNameWaystoneMasterFull)) {
        const run = system.run(() => {
        });
        this.tryReplaceMasterWaystoneMultiblockFromFullBlock(event.player, event.block);
      }
      if (this.isWaystone(event.block)) {
        this.addWaystoneLocation(event.dimension, event.block);
      }
    });
    world.beforeEvents.itemUseOn.subscribe((event) => {
      const source = event.source;
      if (event.itemStack !== void 0) {
        let itemStack = event.itemStack;
        if (itemStack.typeId == this.itemNameWayfinderSimple || itemStack.typeId == this.itemNameWayfinderClairvoyant || itemStack.typeId == this.itemNameWayfinderEcho) {
          let tryBindWayfinderToWaystone = false;
          let wayfinderAlreadyBound = false;
          let bindFail = false;
          let posToWarpTo = event.block;
          let posBound = this.getWayfinderPosFromLore(itemStack, false);
          let dimBound = this.getWayfinderDimFromLore(itemStack, false);
          if (posBound !== void 0) {
            wayfinderAlreadyBound = true;
          }
          let posMasterBase = void 0;
          if (event.block.permutation.matches(this.blockNameWaystoneMasterBase) && CoroUtil.getBlock(event.source.dimension, CoroUtil.up(event.block, 1))?.permutation.matches(this.blockNameWaystoneMasterTop)) {
            posMasterBase = event.block;
          } else if (event.block.permutation.matches(this.blockNameWaystoneMasterTop) && CoroUtil.getBlock(event.source.dimension, CoroUtil.up(event.block, -1))?.permutation.matches(this.blockNameWaystoneMasterBase)) {
            posMasterBase = CoroUtil.up(event.block, -1);
            posToWarpTo = CoroUtil.up(event.block, -1);
          }
          if (posMasterBase !== void 0) {
            if (!wayfinderAlreadyBound) {
              tryBindWayfinderToWaystone = true;
              const run = system.run(() => {
                let blockBase = CoroUtil.getBlock(event.source.dimension, posMasterBase);
                if (blockBase !== void 0 && blockBase.permutation.matches(this.blockNameWaystoneMasterBase)) {
                  blockBase.setPermutation(blockBase.permutation.withState(this.blockPermutationMasterWaystoneActivated, true));
                }
                let blockTop = CoroUtil.getBlock(event.source.dimension, CoroUtil.up(posMasterBase, 1));
                if (blockTop !== void 0 && blockTop.permutation.matches(this.blockNameWaystoneMasterTop)) {
                  blockTop.setPermutation(blockTop.permutation.withState(this.blockPermutationMasterWaystoneActivated, true));
                }
                source.playSound("random.levelup", { volume: 0.1 });
                source.dimension.spawnParticle("razz_ew:wayfinder_charge_explode_activate", CoroUtil.centerXZ(event.block));
                let data = this.getOrCreateMasterWaystoneEntity(event.source.dimension, posMasterBase);
              });
            }
          }
          if (!tryBindWayfinderToWaystone) {
            for (const waystone_name in waystones.naturally_generated) {
              let waystone_data = waystones.naturally_generated[waystone_name];
              if (event.block?.permutation.matches(MODID + ":waystone_biome_" + waystone_name + "_pillar")) {
                let state = "minecraft:cardinal_direction";
                let dir = event.block?.permutation.getState(state);
                tryBindWayfinderToWaystone = true;
                this.setPlayerUsedWayfinderOnBlock(event.source);
                if (!wayfinderAlreadyBound) {
                  const run = system.run(() => {
                    CoroUtil.setBlockAtWithState(source.dimension, event.block, MODID + ":waystone_biome_" + waystone_name + "_pillar_activated", state, dir);
                    source.playSound("random.levelup", { volume: 0.1 });
                    source.dimension.spawnParticle("razz_ew:wayfinder_charge_explode_activate", CoroUtil.centerXZ(event.block));
                  });
                }
                break;
              }
              if (event.block?.permutation.matches(MODID + ":waystone_biome_" + waystone_name + "_pillar_activated")) {
                tryBindWayfinderToWaystone = true;
                this.setPlayerUsedWayfinderOnBlock(event.source);
                break;
              }
            }
          }
          if (!tryBindWayfinderToWaystone) {
            for (const waystone_name in waystones.player) {
              let waystone_data = waystones.player[waystone_name];
              if (event.block?.permutation.matches(MODID + ":waystone_player_" + waystone_name)) {
                let state = "minecraft:cardinal_direction";
                let dir = event.block?.permutation.getState(state);
                tryBindWayfinderToWaystone = true;
                this.setPlayerUsedWayfinderOnBlock(event.source);
                if (!wayfinderAlreadyBound) {
                  const run = system.run(() => {
                    CoroUtil.setBlockAtWithState(source.dimension, event.block, MODID + ":waystone_player_" + waystone_name + "_activated", state, dir);
                    source.playSound("random.levelup", { volume: 0.1 });
                    source.dimension.spawnParticle("razz_ew:wayfinder_charge_explode_activate", CoroUtil.centerXZ(event.block));
                  });
                }
                break;
              }
              if (event.block?.permutation.matches(MODID + ":waystone_player_" + waystone_name + "_activated")) {
                tryBindWayfinderToWaystone = true;
                this.setPlayerUsedWayfinderOnBlock(event.source);
                break;
              }
            }
          }
          if (posBound !== void 0 && dimBound !== void 0 && event.block?.permutation.matches("minecraft:lectern")) {
            const run = system.run(() => {
              if (posBound !== void 0 && dimBound !== void 0) {
                this.setPlayerUsedWayfinderOnBlock(event.source);
                let posEnt = CoroUtil.add(event.block, 0.5, 1, 0.5);
                let entCheck = event.source.dimension.getEntities({ type: this.entityNameWayfinder, location: posEnt, maxDistance: 0.5 });
                if (entCheck.length == 0) {
                  var ent = event.source.dimension.spawnEntity(this.entityNameWayfinder, posEnt);
                  let id = 0;
                  if (itemStack.typeId == this.itemNameWayfinderClairvoyant) {
                    id = 1;
                  } else if (itemStack.typeId == this.itemNameWayfinderEcho) {
                    id = 2;
                  }
                  ent.setProperty("rb:wayfinder_id", id);
                  let posRecall = this.getWayfinderPosFromLore(itemStack, true);
                  let dimRecall = this.getWayfinderDimFromLore(itemStack, true);
                  if (posRecall == void 0) {
                    posRecall = CoroUtil.copyVector3(posBound);
                    posRecall.y = -999;
                  }
                  if (dimRecall == void 0) {
                    dimRecall = dimBound;
                  }
                  let jsonProperty = {
                    wayfinder_id: itemStack.typeId,
                    dim: CoroUtil.dimStringIDToNumberID(dimBound.id),
                    x: posBound.x,
                    y: posBound.y,
                    z: posBound.z,
                    dim_recall: CoroUtil.dimStringIDToNumberID(dimRecall.id),
                    x_recall: posRecall.x,
                    y_recall: posRecall.y,
                    z_recall: posRecall.z
                  };
                  ent.setDynamicProperty(this.propWayfinderEntityData, JSON.stringify(jsonProperty));
                  CoroUtil.setSlot(event.source, void 0, EquipmentSlot.Mainhand);
                }
              }
            });
          }
          if (tryBindWayfinderToWaystone) {
            if (!wayfinderAlreadyBound) {
              const run = system.run(() => {
                this.setWayfinderPosToLore(itemStack, event.source.dimension, posToWarpTo, void 0, void 0);
                CoroUtil.setSlot(event.source, itemStack, EquipmentSlot.Mainhand);
                let str = (CoroUtil.vector3ToString(posToWarpTo) + "," + event.source.dimension.id.replace("minecraft:", "")).replace(new RegExp("\\,", "g"), ", ");
                this.subtitleRaw(event.source, '{"rawtext":[{"translate":"msg.wayfinder_bound"}, {"text": " ' + str + '"}]}');
                event.source.setDynamicProperty(this.propPlayerWayfinderUseCooldown, this.playerWayfinderUseCooldownMax);
              });
            } else {
              this.subtitleRaw(event.source, '{"rawtext":[{"translate":"msg.wayfinder_bound_already"}]}');
              this.actionBarRaw(event.source, '{"rawtext":[{"translate":"msg.wayfinder_bound_recipe"}]}');
            }
          } else {
          }
          if (!tryBindWayfinderToWaystone) {
            if (event.block.permutation.matches(this.blockNameWaystoneMasterBase) && CoroUtil.getBlock(event.source.dimension, CoroUtil.up(event.block, 1))?.permutation.matches(this.blockNameWaystoneMasterTop)) {
              this.setPlayerUsedWayfinderOnBlock(event.source);
              const run = system.run(() => {
                this.useWayfinderOnMasterWaystone(event.source.dimension, event.block, itemStack, event.source.isSneaking);
              });
            } else if (event.block.permutation.matches(this.blockNameWaystoneMasterTop) && CoroUtil.getBlock(event.source.dimension, CoroUtil.up(event.block, -1))?.permutation.matches(this.blockNameWaystoneMasterBase)) {
              this.setPlayerUsedWayfinderOnBlock(event.source);
              const run = system.run(() => {
                this.useWayfinderOnMasterWaystone(event.source.dimension, CoroUtil.up(event.block, -1), itemStack, event.source.isSneaking);
              });
            }
          }
        } else {
        }
      }
    });
    world.afterEvents.itemStartUse.subscribe((event) => {
      let itemStack = event.itemStack;
      log("itemStartUse " + itemStack.typeId);
      if (itemStack.typeId == this.itemNameWayfinderSimple || itemStack.typeId == this.itemNameWayfinderClairvoyant || itemStack.typeId == this.itemNameWayfinderEcho || itemStack.typeId == this.itemNameWayfinderWildcard) {
        if (event.source instanceof Player) {
          let player = event.source;
          if (CoroUtil.getPropNumber(player, this.propPlayerWayfinderUseCooldown) <= 0) {
            if (itemStack.getLore().length >= 2 || itemStack.typeId == this.itemNameWayfinderWildcard) {
              player.setDynamicProperty(this.propPlayerIsUsingWayfinder, true);
            } else {
              this.subtitleRaw(player, '{"rawtext":[{"translate":"msg.wayfinder_not_bound"}]}');
            }
          } else {
            log("on cooldown");
          }
        }
      }
    });
    world.afterEvents.itemStopUse.subscribe((event) => {
      let itemStack = event.itemStack;
      if (itemStack !== void 0) {
        log("itemStopUse " + itemStack.typeId);
        if (itemStack.typeId == this.itemNameWayfinderSimple || itemStack.typeId == this.itemNameWayfinderClairvoyant || itemStack.typeId == this.itemNameWayfinderEcho || itemStack.typeId == this.itemNameWayfinderWildcard) {
          if (event.source instanceof Player) {
            let player = event.source;
            player.setDynamicProperty(this.propPlayerIsUsingWayfinder, false);
          }
        }
      }
    });
    world.beforeEvents.itemUse.subscribe((event) => {
      const source = event.source;
      let itemStack = event.itemStack;
      if (itemStack.typeId == this.itemNameDevTool) {
        if (event.source instanceof Player) {
          let player = event.source;
          if (player.isSneaking || !player.isOnGround) {
            player.runCommandAsync("tp ^ ^ ^100");
          } else {
            let gameMode = CoroUtil.getGameMode(player);
            if (gameMode == GameMode.survival) {
              player.runCommandAsync("gamemode creative @s");
            } else if (gameMode == GameMode.creative) {
              player.runCommandAsync("gamemode survival @s");
            }
          }
        }
      }
    });
  }
  getRandomProperty(obj) {
    const keys = Object.keys(obj);
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  }
  getFirstFarAwayWaystone(player, waystones2, maxDist) {
    let shuffledProperties = this.shuffleProperties(waystones2);
    let pos = void 0;
    let tryCount = 0;
    for (let waystonePos in shuffledProperties) {
      pos = CoroUtil.stringToVector3(waystonePos);
      if (CoroUtil.distToCoord(player.location, pos) > maxDist) {
        return pos;
      }
      tryCount++;
      if (tryCount >= 50)
        break;
    }
    return void 0;
  }
  shuffleProperties(obj) {
    const keys = Object.keys(obj);
    const shuffledKeys = this.shuffleArray(keys);
    const newObj = {};
    for (const key of shuffledKeys) {
      newObj[key] = obj[key];
    }
    return newObj;
  }
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  titleClear(player) {
    player.runCommandAsync("title @s clear");
  }
  titleTimes(player, fadeIn, stay, fadeOut) {
    player.runCommandAsync("title @s times " + fadeIn + " " + stay + " " + fadeOut);
    this.titleTimesMax = fadeIn + stay + fadeOut;
  }
  subtitle(player, text) {
    player.runCommandAsync("title @s subtitle " + text);
    player.runCommandAsync("title @s title \xA7");
    player.setDynamicProperty(this.propPlayerTitleTimes, this.titleTimesMax);
  }
  subtitleRaw(player, text) {
    player.runCommandAsync("titleraw @s subtitle " + text);
    player.runCommandAsync("title @s title \xA7");
    player.setDynamicProperty(this.propPlayerTitleTimes, this.titleTimesMax);
  }
  subtitleRawSimple(player, text) {
    player.runCommandAsync('titleraw @s subtitle {"rawtext":[{"translate":"' + text + '"}]}');
    player.runCommandAsync("title @s title \xA7");
    player.setDynamicProperty(this.propPlayerTitleTimes, this.titleTimesMax);
  }
  actionBar(player, text) {
    player.runCommandAsync("title @s actionbar " + text);
    player.runCommandAsync("title @s title \xA7");
  }
  actionBarRaw(player, text) {
    player.runCommandAsync("titleraw @s actionbar " + text);
    player.runCommandAsync("title @s title \xA7");
  }
  actionBarRawSimple(player, text) {
    player.runCommandAsync('titleraw @s actionbar {"rawtext":[{"translate":"' + text + '"}]}');
    player.runCommandAsync("title @s title \xA7");
  }
  tryReplaceMasterWaystoneMultiblockFromFullBlock(player, pos) {
    let dimension = player.dimension;
    if (CoroUtil.getBlock(dimension, CoroUtil.up(pos, 1))?.isAir) {
      var block = CoroUtil.getBlock(dimension, pos);
      if (block !== void 0) {
        let state = "minecraft:cardinal_direction";
        let dir = block.permutation.getState(state);
        block.setPermutation(BlockPermutation.resolve(this.blockNameWaystoneMasterBase).withState(state, dir));
        var blockUp = CoroUtil.getBlock(dimension, CoroUtil.up(pos, 1));
        if (blockUp !== void 0) {
          blockUp.setPermutation(BlockPermutation.resolve(this.blockNameWaystoneMasterTop).withState(state, dir));
        }
      }
    } else {
      CoroUtil.setBlockAt(dimension, {
        x: pos.x,
        y: pos.y,
        z: pos.z
      }, "air");
      if (CoroUtil.getGameMode(player) != GameMode.creative) {
        player.dimension.spawnItem(new ItemStack(this.blockNameWaystoneMasterFull), pos);
      }
    }
  }
  getWayfinderPosFromLore(itemStack, getRecalInstead) {
    let lore = itemStack.getLore();
    if (lore.length < 3) {
      return void 0;
    }
    if (lore.length < 4 && getRecalInstead) {
      return void 0;
    }
    try {
      let coordIndex = 2;
      if (getRecalInstead)
        coordIndex = 3;
      let pos = CoroUtil.stringifiedDimPosToVector3(CoroUtil.unhideText(lore[coordIndex]));
      return pos;
    } catch (e) {
      err("error: " + e.message);
      return void 0;
    }
  }
  getWayfinderDimFromLore(itemStack, getRecalInstead) {
    let lore = itemStack.getLore();
    if (lore.length < 3) {
      return void 0;
    }
    if (lore.length < 4 && getRecalInstead) {
      return void 0;
    }
    try {
      let coordIndex = 2;
      if (getRecalInstead)
        coordIndex = 3;
      let dim = CoroUtil.stringifiedDimPosToDimension(CoroUtil.unhideText(lore[coordIndex]));
      return dim;
    } catch (e) {
      err("error: " + e.message);
      return void 0;
    }
  }
  setWayfinderPosToLore(itemStack, dimBound, posBound, dimRecal, posRecal) {
    let lore = itemStack.getLore();
    while (lore.length < 4) {
      lore.push("");
    }
    let posBoundString = "";
    let posRecalString = "";
    if (posBound !== void 0 && dimBound !== void 0) {
      posBoundString = posBound.x + " " + posBound.y + " " + posBound.z + ", " + dimBound.id.replace("minecraft:", "");
      lore[0] = "Bound to " + posBoundString;
      lore[2] = CoroUtil.hideText(CoroUtil.dimVector3ToStringifiedDimPos(dimBound, posBound));
    }
    if (posRecal !== void 0 && posRecal !== null && dimRecal !== void 0) {
      posRecalString = posRecal.x + " " + posRecal.y + " " + posRecal.z + ", " + dimRecal.id.replace("minecraft:", "");
      lore[1] = "Next use recalls to " + posRecalString;
      lore[3] = CoroUtil.hideText(CoroUtil.dimVector3ToStringifiedDimPos(dimRecal, posRecal));
    } else if (posRecal == null) {
      posRecalString = "";
      lore[1] = "";
      lore[3] = posRecalString;
    }
    itemStack.setLore(lore);
  }
  hitMasterWaystoneMenuDestination(menuDestination, player) {
    this.lookedAtMasterWaystoneMenuDestination(menuDestination, player);
  }
  interactMasterWaystoneMenuDestination(menuDestination) {
    log("interact");
    try {
      let player = CoroUtil.getClosestPlayerToPos(menuDestination.location);
      let dataEntity = this.getWaystoneDataEntity(menuDestination);
      if (player !== void 0 && dataEntity !== void 0) {
        let jsonArray = this.getWaystoneJsonData(dataEntity);
        let index = CoroUtil.getPropNumber(menuDestination, this.propMenuDataDestinationIndex);
        if (index <= jsonArray.length - 1) {
          let count = 0;
          let jsonDestination = jsonArray[index];
          if (!player.hasComponent("equippable"))
            return;
          const equippable = player.getComponent("equippable");
          let item = equippable.getEquipment(EquipmentSlot.Mainhand);
          if (item != void 0 && item.typeId == "minecraft:name_tag") {
            let name = equippable.getEquipment(EquipmentSlot.Mainhand)?.nameTag;
            if (name === void 0) {
              name = "";
            }
            jsonDestination.name = name;
            dataEntity.setDynamicProperty("data", JSON.stringify(jsonArray));
            player.setDynamicProperty("getLastLookedAtEntity", -1);
          } else {
            log("jsonDestination: " + CoroUtil.vector3ToString({ x: jsonDestination.x, y: jsonDestination.y, z: jsonDestination.z }));
            if (CoroUtil.isLoaded(player.dimension, player.location)) {
              player.dimension.spawnParticle("razz_ew:wayfinder_charge_explode_activate", player.location);
            }
            this.tryTeleportWithCost(player, world.getDimension(CoroUtil.dimNumberIDToStringID(jsonDestination.dim)), { x: jsonDestination.x, y: jsonDestination.y, z: jsonDestination.z });
          }
        }
      }
    } catch (error) {
      err("caught error: " + error.message);
    }
  }
  lookedAtMasterWaystoneMenuDestination(menuDestination, player) {
    if (CoroUtil.getPropString(player, "getLastLookedAtEntity") != menuDestination.id) {
      let dataEntity = this.getWaystoneDataEntity(menuDestination);
      if (player !== void 0 && dataEntity !== void 0) {
        let menuEntity = this.getWaystoneMenuEntity(dataEntity);
        let jsonArray = this.getWaystoneJsonData(dataEntity);
        let index = CoroUtil.getPropNumber(menuDestination, this.propMenuDataDestinationIndex);
        if (index <= jsonArray.length - 1 && menuEntity !== void 0) {
          let isRight = (index + 1) % 2 == 0;
          let count = 0;
          let jsonDestination = jsonArray[index];
          menuEntity.nameTag = jsonDestination.name + "\n" + jsonDestination.x + ", " + jsonDestination.y + ", " + jsonDestination.z + ", " + CoroUtil.dimNumberIDToStringID(jsonDestination.dim).replace("minecraft:", "");
          player.playSound("click_on.stone_pressure_plate", { volume: 0.3, pitch: 1.5 });
          menuDestination.runCommandAsync("playanimation @s " + (!isRight ? "pop_right" : "pop_left"));
          player.setDynamicProperty("getLastLookedAtEntity", menuDestination.id);
        }
      }
    }
  }
  getWaystoneDataEntity(entityDestination) {
    let dataEntityID = CoroUtil.getPropString(entityDestination, this.propDataEntID);
    if (dataEntityID !== "") {
      return world.getEntity(dataEntityID);
    }
    return void 0;
  }
  getWaystoneMenuEntity(entityData) {
    let menuEntityID = CoroUtil.getPropString(entityData, this.propMasterWaystoneDataMenuEntID);
    if (menuEntityID !== "") {
      return world.getEntity(menuEntityID);
    }
    return void 0;
  }
  getWaystoneJsonData(data) {
    let dataString = CoroUtil.getPropString(data, "data");
    if (dataString !== "") {
      return JSON.parse(dataString);
    }
    return [];
  }
  useWayfinderOnMasterWaystone(dim, pos, item, isSneaking) {
    let data = this.getOrCreateMasterWaystoneEntity(dim, pos);
    let dataString = CoroUtil.getPropString(data, "data");
    let player = CoroUtil.getClosestPlayerToPos(data.location);
    this.closeMasterWaystoneGUI(data, false);
    let jsonArray = [];
    if (dataString !== "") {
      try {
        jsonArray = JSON.parse(dataString);
      } catch (error) {
        err("" + error.message);
      }
    }
    let posTeleport = this.getWayfinderPosFromLore(item, false);
    let dimTeleport = this.getWayfinderDimFromLore(item, false);
    if (posTeleport === void 0 || posTeleport.x == null || posTeleport.x == void 0 || Number.isNaN(posTeleport.x) || dimTeleport === void 0) {
      err("error couldnt get coords from wayfinder");
      if (player !== void 0)
        this.subtitleRawSimple(player, "msg.wayfinder_not_bound");
      if (isSneaking) {
      }
      return;
    }
    let foundEntry = false;
    let index = 0;
    for (const entry of jsonArray) {
      if (entry.x == posTeleport.x && entry.y == posTeleport.y && entry.z == posTeleport.z) {
        err("entry already exists: " + index);
        foundEntry = true;
        break;
      }
      index++;
    }
    let itemCustomName = item.nameTag;
    log("item name: " + itemCustomName);
    if (itemCustomName === void 0) {
      itemCustomName = "";
    }
    if (!foundEntry) {
      if (jsonArray.length >= 8 && !isSneaking) {
        if (player !== void 0)
          this.subtitleRawSimple(player, "msg.waystone_master_full");
        return;
      }
      let jsonProperty = {
        name: itemCustomName,
        ent_id: "",
        dim: CoroUtil.dimStringIDToNumberID(dimTeleport.id),
        x: posTeleport.x,
        y: posTeleport.y,
        z: posTeleport.z
      };
      if (!isSneaking) {
        jsonArray.push(jsonProperty);
        log("added destination: " + jsonArray.length);
        if (player !== void 0)
          this.actionBarRawSimple(player, "msg.waystone_master_added");
      }
    } else {
      if (isSneaking) {
        log("removing destination: " + index);
        if (player !== void 0)
          this.actionBarRawSimple(player, "msg.waystone_master_removed");
        jsonArray.splice(index, 1);
      } else {
        if (jsonArray[index].name != itemCustomName) {
          log("updating name for destination");
          if (player !== void 0)
            this.actionBarRawSimple(player, "msg.waystone_master_updated");
          jsonArray[index].name = itemCustomName;
        }
      }
    }
    let blockBase = CoroUtil.getBlock(dim, pos);
    if (blockBase !== void 0 && blockBase.permutation.matches(this.blockNameWaystoneMasterBase)) {
      blockBase.setPermutation(blockBase.permutation.withState(this.blockPermutationMasterWaystoneWayfinderCount, jsonArray.length));
    }
    let blockTop = CoroUtil.getBlock(dim, CoroUtil.up(pos, 1));
    if (blockTop !== void 0 && blockTop.permutation.matches(this.blockNameWaystoneMasterTop)) {
      blockTop.setPermutation(blockTop.permutation.withState(this.blockPermutationMasterWaystoneWayfinderCount, jsonArray.length));
    }
    data.setDynamicProperty("data", JSON.stringify(jsonArray));
  }
  openMasterWaystoneGUI(dim, player, pos) {
    let data = this.getOrCreateMasterWaystoneEntity(dim, pos);
    let isOpen = CoroUtil.getPropBool(data, "isOpen");
    if (!isOpen) {
      data.setDynamicProperty("isOpen", true);
      player.setDynamicProperty("getLastLookedAtEntity", 0);
      let dataString = CoroUtil.getPropString(data, "data");
      if (dataString !== "") {
        let jsonArray = JSON.parse(dataString);
        if (jsonArray.length > 0) {
          if (this.configMasterWaystonePistonNoise) {
            player.playSound("tile.piston.out", { volume: 0.3, pitch: 1.2 });
          }
        }
        let spawnVecAdjust = CoroUtil.getAxisLockedScalarVectorBasedOnBlockState(dim, pos);
        var menu = dim.spawnEntity(this.entityNameWaystoneMasterMenu, CoroUtil.add(pos, 0.5, 2.1, 0.5));
        let rot = CoroUtil.toDegrees(CoroUtil.getAxisLockedRotationBasedOnBlockState(dim, pos)) / 90;
        menu.setProperty(MODID + ":rot", rot);
        menu.setDynamicProperty(this.propDataEntID, data.id);
        data.setDynamicProperty(this.propMasterWaystoneDataMenuEntID, menu.id);
        let count = 0;
        let pushOut = 0.35;
        let yAdj = 0;
        let yAdjAmount = -0.3;
        for (const entry of jsonArray) {
          let leftRightAdj = -0.25;
          if ((count + 1) % 2 == 0) {
            leftRightAdj *= -1;
          }
          if (count + 1 >= 7) {
            yAdj = yAdjAmount * 4;
          } else if (count + 1 >= 5) {
            yAdj = yAdjAmount * 3;
          } else if (count + 1 >= 3) {
            yAdj = yAdjAmount * 2;
          } else {
            yAdj = yAdjAmount * 1;
          }
          let posRelative = CoroUtil.add(pos, 0.5 + leftRightAdj * spawnVecAdjust.z + pushOut * spawnVecAdjust.x, 2.3 + yAdj, 0.5 + leftRightAdj * -spawnVecAdjust.x + pushOut * spawnVecAdjust.z);
          var menu_entry = dim.spawnEntity(this.entityNameWaystoneMasterMenuDestination, posRelative);
          menu_entry.setProperty(MODID + ":rot", rot);
          menu_entry.setProperty(MODID + ":index", count);
          let leftRight = (count + 1) % 2 == 0 ? "left" : "right";
          menu_entry.setProperty(MODID + ":model", leftRight);
          menu_entry.setDynamicProperty(this.propDataEntID, data.id);
          menu_entry.setDynamicProperty(this.propMenuDataDestinationIndex, count);
          entry.ent_id = menu_entry.id;
          count++;
        }
        data.setDynamicProperty("data", JSON.stringify(jsonArray));
      }
    } else {
    }
  }
  getOrCreateMasterWaystoneEntity(dim, posBlock) {
    let posEntity = CoroUtil.add(posBlock, 0.5, 0.5, 0.5);
    let entities = dim.getEntities({ type: this.entityNameWaystoneMasterData, closest: 1, location: posEntity, maxDistance: 0.5 });
    if (entities.length > 0) {
      return entities[0];
    } else {
      var ent = dim.spawnEntity(this.entityNameWaystoneMasterData, posEntity);
      ent.dimension.getPlayers({ location: ent.location, maxDistance: 12 }).forEach((player) => {
        player.playSound("random.levelup", { volume: 0.1 });
      });
      ent.dimension.spawnParticle("razz_ew:wayfinder_charge_explode_activate", ent.location);
      return ent;
    }
  }
  removeMasterWaystoneEntity(dim, posBlock) {
    let posEntity = CoroUtil.add(posBlock, 0.5, 0.5, 0.5);
    let entities = dim.getEntities({ type: this.entityNameWaystoneMasterData, closest: 1, location: posEntity, maxDistance: 0.5 });
    log("killing at " + CoroUtil.vector3ToString(posEntity));
    if (entities.length > 0) {
      log("found existing waystone entity to kill");
      this.closeMasterWaystoneGUI(entities[0], true);
      CoroUtil.despawnEntity(entities[0]);
    } else {
      log("didnt find existing waystone entity to kill");
    }
  }
  getSafeSpotToSpawnWaystoneOnSurfaceHeightmapHere(dim, pos) {
    var posWithHeightmap = { x: pos.x, y: this.getHeightMap(dim, pos), z: pos.z };
    if (posWithHeightmap.y >= CoroUtil.getMinWorldHeight(dim)) {
      posWithHeightmap = { x: pos.x, y: this.getFirstNonLeafNonAirNonLiquidBlock(dim, posWithHeightmap), z: pos.z };
      if (posWithHeightmap.y >= CoroUtil.getMinWorldHeight(dim)) {
        var blockUp = CoroUtil.getBlock(dim, CoroUtil.up(posWithHeightmap, 1));
        if (blockUp != void 0 && this.isPosReplaceableBlockOrAir(dim, blockUp)) {
          blockUp = CoroUtil.getBlock(dim, CoroUtil.up(posWithHeightmap, 2));
          if (blockUp != void 0 && this.isPosReplaceableBlockOrAir(dim, blockUp)) {
            return CoroUtil.up(posWithHeightmap, 1).y;
          }
        }
      }
    }
    return -999;
  }
  getSafeSpotToSpawnWaystoneSolidGrowndBelowHere(dim, pos) {
    if (pos.y >= CoroUtil.getMinWorldHeight(dim)) {
      pos = { x: pos.x, y: this.getFirstNonLeafNonAirNonLiquidBlock(dim, pos), z: pos.z };
      if (pos.y >= CoroUtil.getMinWorldHeight(dim)) {
        var blockUp = CoroUtil.getBlock(dim, CoroUtil.up(pos, 1));
        if (blockUp != void 0) {
          let canGen = this.isPosReplaceableBlockOrAir(dim, blockUp);
          if (canGen) {
            blockUp = CoroUtil.getBlock(dim, CoroUtil.up(pos, 2));
            if (blockUp != void 0) {
              canGen = this.isPosReplaceableBlockOrAir(dim, blockUp);
              if (canGen) {
                return CoroUtil.up(pos, 1).y;
              } else {
              }
            } else {
            }
          }
        }
      }
    }
    return -998;
  }
  getFirstNonLeafNonAirNonLiquidBlock(dim, pos) {
    var i = 0;
    for (; i < this.configMaxScanDownDistanceFromPosCave; i++) {
      var posScan = pos;
      posScan.y -= i;
      var block = CoroUtil.getBlock(dim, posScan);
      if (block !== void 0) {
        if (!block.isAir && !block.isLiquid) {
          let foundReplaceable = false;
          if (this.isPosReplaceableBlockOrAir(dim, block)) {
            log("found a replacable");
            foundReplaceable = true;
          }
          if (foundReplaceable) {
            continue;
          }
          var foundLeaves = false;
          var block_list = [
            "leaves",
            "leaves2",
            "acacia_leaves",
            "birch_leaves",
            "dark_oak_leaves",
            "jungle_leaves",
            "oak_leaves",
            "azalea_leaves",
            "azalea_leaves_flowered",
            "cherry_leaves",
            "mangrove_leaves"
          ];
          for (var entry of block_list) {
            if (block.permutation.matches("minecraft:" + entry)) {
              foundLeaves = true;
              break;
            }
          }
          if (!foundLeaves) {
            for (var entry of solid_ground_blocks_to_gen_on) {
              if (block?.permutation.matches("minecraft:" + entry)) {
                log("matches " + entry);
                return posScan.y;
              }
            }
            return -999;
          }
        }
      }
    }
    return -999;
  }
  getHeightMap(dim, pos) {
    if (CoroUtil.getBlock(dim, pos) !== void 0) {
      var result = dim.getBlockFromRay({ x: pos.x, y: 160, z: pos.z }, { x: 0, y: -1, z: 0 });
      if (result !== void 0) {
        var y = result.block.location.y;
        if (y > CoroUtil.getMinWorldHeight(dim)) {
          return y;
        }
      }
    }
    return -999;
  }
  tick() {
    super.tick();
    if (!this.modActive)
      return;
    if (this.echoWayfinderFixSetLoreDelay > 0) {
      this.echoWayfinderFixSetLoreDelay--;
      if (this.echoWayfinderFixSetLoreDelay == 0) {
        if (this.echoWayfinderFixTempItemStack !== void 0 && this.echoWayfinderFixTempPlayerID !== "") {
          let playerTemp = world.getEntity(this.echoWayfinderFixTempPlayerID);
          if (playerTemp instanceof Player) {
            CoroUtil.setSlot(playerTemp, this.echoWayfinderFixTempItemStack, EquipmentSlot.Mainhand);
            this.echoWayfinderFixTempPlayerID = "";
            this.echoWayfinderFixTempItemStack = void 0;
          }
        }
      }
    }
    let players = world.getAllPlayers();
    for (const player of players) {
      setPropIfChanged(player, this.propPlayerItemWasUsedOnBlock, false); // [PATCH Clebao]
      let dim = player.dimension;
      var data = this.getPlayerData(player);
      let maxRange = 6;
      let maxRangeY = 2;
      let tryPos = {
        x: player.location.x + Math.random() * maxRange - Math.random() * maxRange,
        y: player.location.y + Math.random() * maxRangeY - Math.random() * maxRangeY,
        z: player.location.z + Math.random() * maxRange - Math.random() * maxRange
      };
      if (CoroUtil.isLoaded(dim, tryPos)) {
        let block = CoroUtil.getBlock(dim, tryPos);
        if (block !== void 0) {
          if (this.isWaystoneActivated(block)) {
            dim.spawnParticle("razz_ew:waystone_shimmer_long", CoroUtil.up(CoroUtil.centerXZ(block), -1));
          }
        }
      }
      if (player.isSneaking || !player.isOnGround) {
        let pos = player.location;
        pos.y--;
        let block = CoroUtil.getBlock(dim, pos);
        if (player.isSneaking && !data.wasSneaking) {
          if (block !== void 0 && this.isElevator(block)) {
            let elevatorPos = this.findElevator(dim, pos, -1);
            if (elevatorPos !== void 0) {
              dim.spawnParticle("razz_ew:wayfinder_charge_explode_small", CoroUtil.up(CoroUtil.centerXZ(CoroUtil.floor(block)), 1.1));
              this.teleportWithDelayedSound(player, dim, CoroUtil.up(elevatorPos, 1));
            } else {
              if (this.configElevatorSearchDist != -1) {
                this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.elevator_none_found"}, {"text": " ' + this.configElevatorSearchDist + ' "}, {"translate":"msg.elevator_none_found_2"}]}');
              } else {
                this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.elevator_none_found_3"}]}');
              }
            }
          }
        } else if (!player.isOnGround && data.wasOnGround) {
          if (block !== void 0 && this.isElevator(block)) {
            let elevatorPos = this.findElevator(dim, pos, 1);
            if (elevatorPos !== void 0) {
              dim.spawnParticle("razz_ew:wayfinder_charge_explode_small", CoroUtil.up(CoroUtil.centerXZ(CoroUtil.floor(block)), 1.1));
              this.teleportWithDelayedSound(player, dim, CoroUtil.up(elevatorPos, 0.9));
            } else {
              if (this.configElevatorSearchDist != -1) {
                this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.elevator_none_found"}, {"text": " ' + this.configElevatorSearchDist + ' "}, {"translate":"msg.elevator_none_found_2"}]}');
              } else {
                this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.elevator_none_found_3"}]}');
              }
            }
          }
        }
      }
      let titleTicks = CoroUtil.getPropNumber(player, this.propPlayerTitleTimes);
      if (titleTicks > 0) {
        titleTicks--;
        player.setDynamicProperty(this.propPlayerTitleTimes, titleTicks);
      }
      let wayfinderCooldownTicks = CoroUtil.getPropNumber(player, this.propPlayerWayfinderUseCooldown);
      if (wayfinderCooldownTicks > 0) {
        wayfinderCooldownTicks--;
        player.setDynamicProperty(this.propPlayerWayfinderUseCooldown, wayfinderCooldownTicks);
      }
      if (system.currentTick % 5 == 0 && titleTicks == 0) {
        let itemStack = CoroUtil.getSlot(player, EquipmentSlot.Mainhand);
        if (itemStack !== void 0) {
          if (itemStack.typeId == this.itemNameWayfinderSimple || itemStack.typeId == this.itemNameWayfinderClairvoyant || itemStack.typeId == this.itemNameWayfinderEcho) {
            let propItemID = CoroUtil.getPropString(player, this.propPlayerLastItemInHandID);
            let propItemLoreFirstLine = CoroUtil.getPropString(player, this.propPlayerLastItemInHandLoreFirstLine);
            let lore = itemStack.getLore()[0] ?? "";
            let loreRecal = itemStack.getLore()[1] ?? "";
            if (loreRecal !== "") {
              lore = loreRecal;
            }
            if (propItemID !== itemStack.typeId || propItemLoreFirstLine !== lore) {
              if (lore !== "") {
                this.actionBar(player, lore);
              } else {
                this.actionBar(player, "Not bound");
              }
            } else {
            }
            setPropIfChanged(player, this.propPlayerLastItemInHandID, itemStack.typeId);
            setPropIfChanged(player, this.propPlayerLastItemInHandLoreFirstLine, lore);
          } else {
            setPropIfChanged(player, this.propPlayerLastItemInHandID, itemStack.typeId);
            setPropIfChanged(player, this.propPlayerLastItemInHandLoreFirstLine, "");
          }
        } else {
          setPropIfChanged(player, this.propPlayerLastItemInHandID, "");
          setPropIfChanged(player, this.propPlayerLastItemInHandLoreFirstLine, "");
        }
      }
      let isUsingLecternWayfinder = CoroUtil.getPropBool(player, this.propPlayerIsUsingLecternWayfinder);
      if (system.currentTick % 10 == 0 || isUsingLecternWayfinder) {
        let stillUsing = false;
        if (player.isSneaking) {
          let ent = this.getClosestLecternWayfinderToPlayer(player);
          if (ent !== void 0) {
            stillUsing = true;
            isUsingLecternWayfinder = true;
            player.setDynamicProperty(this.propPlayerIsUsingLecternWayfinder, true);
            if (system.currentTick % 10 == 0) {
              dim.spawnParticle("razz_ew:wayfinder_charge_emit", CoroUtil.up(ent.location, 0.5));
            }
          }
        }
        if (!stillUsing) {
          isUsingLecternWayfinder = false;
          player.setDynamicProperty(this.propPlayerIsUsingLecternWayfinder, false);
        }
      }
      data.wasOnGround = player.isOnGround;
      data.wasSneaking = player.isSneaking;
      if (system.currentTick % 5 == 0) {
        let entities = dim.getEntities({ type: this.entityNameWaystoneMasterData, location: player.location, maxDistance: 7 });
        if (entities.length > 0) {
          let hitResult = CoroUtil.customRaytrace(player, this.entityNameWaystoneMasterMenuDestination, 0.2, 0.25, 5);
          for (let entry of hitResult) {
            if (entry.typeId == this.entityNameWaystoneMasterMenuDestination) {
              this.lookedAtMasterWaystoneMenuDestination(entry, player);
            }
          }
        }
      }
      let isUsingWayfinder = CoroUtil.getPropBool(player, this.propPlayerIsUsingWayfinder);
      let speed = CoroUtil.getSpeed(player);
      if ((isUsingWayfinder || isUsingLecternWayfinder) && speed < 0.02) {
        let ticks = CoroUtil.getPropNumber(player, this.propPlayerUsingWayfinderTicks);
        player.setDynamicProperty(this.propPlayerUsingWayfinderTicks, ticks + 1);
        let start = 0;
        if (ticks >= start && ticks % 3 == 0) {
          const particleOptions = new MolangVariableMap();
          let height = Math.min(1.2, 0.15 * ((ticks - start) / 5));
          particleOptions.setFloat("height", 0);
          particleOptions.setFloat("height_range", height);
          if (CoroUtil.isLoaded(dim, player.location)) {
            dim.spawnParticle("razz_ew:wayfinder_charge_body4", player.location, particleOptions);
          }
        }
        if (ticks == 10)
          player.playSound("portal.portal", { location: player.location, pitch: 1.5 });
        if (ticks >= 60) {
          player.setDynamicProperty(this.propPlayerUsingWayfinderTicks, 0);
          if (CoroUtil.isLoaded(dim, player.location)) {
            dim.spawnParticle("razz_ew:wayfinder_charge_explode", player.location);
          }
          if (isUsingWayfinder) {
            let itemStack = CoroUtil.getSlot(player, EquipmentSlot.Mainhand);
            if (itemStack !== void 0) {
              if (itemStack.typeId == this.itemNameWayfinderSimple) {
                if (!this.getPlayerUsedWayfinderOnBlock(player)) {
                  let lore = itemStack.getLore();
                  if (lore.length >= 2) {
                    let heightMap = this.getHeightMap(player.dimension, player.location);
                    if (heightMap <= player.location.y) {
                      const run = system.run(() => {
                        if (itemStack === void 0)
                          return;
                        let pos = this.getWayfinderPosFromLore(itemStack, false);
                        let dim2 = this.getWayfinderDimFromLore(itemStack, false);
                        if (pos !== void 0 && dim2 !== void 0) {
                          this.tryTeleportWithCost(player, dim2, pos);
                          player.setDynamicProperty(this.propPlayerWayfinderUseCooldown, this.playerWayfinderUseCooldownMax);
                          player.setDynamicProperty(this.propPlayerIsUsingWayfinder, false);
                        }
                      });
                    } else {
                      this.subtitleRaw(player, '{"rawtext":[{"translate":"msg.wayfinder_cant_see_sky"}]}');
                    }
                  } else {
                    this.subtitleRaw(player, '{"rawtext":[{"translate":"msg.wayfinder_not_bound"}]}');
                  }
                }
              }
              if (itemStack.typeId == this.itemNameWayfinderClairvoyant) {
                let lore = itemStack.getLore();
                if (lore.length >= 2) {
                  if (!this.getPlayerUsedWayfinderOnBlock(player)) {
                    const run = system.run(() => {
                      if (itemStack === void 0)
                        return;
                      let pos = this.getWayfinderPosFromLore(itemStack, false);
                      let dim2 = this.getWayfinderDimFromLore(itemStack, false);
                      if (pos !== void 0 && dim2 !== void 0) {
                        this.tryTeleportWithCost(player, dim2, pos);
                        player.setDynamicProperty(this.propPlayerWayfinderUseCooldown, this.playerWayfinderUseCooldownMax);
                        player.setDynamicProperty(this.propPlayerIsUsingWayfinder, false);
                      }
                    });
                  }
                } else {
                  this.subtitleRawSimple(player, "msg.wayfinder_not_bound");
                }
              }
              if (itemStack.typeId == this.itemNameWayfinderEcho && this.echoWayfinderFixSetLoreDelay == 0) {
                let lore = itemStack.getLore();
                if (lore.length >= 2) {
                  if (!this.getPlayerUsedWayfinderOnBlock(player)) {
                    const run = system.run(() => {
                      if (itemStack === void 0)
                        return;
                      let posBound = this.getWayfinderPosFromLore(itemStack, false);
                      let dimBound = this.getWayfinderDimFromLore(itemStack, false);
                      let posRecal = this.getWayfinderPosFromLore(itemStack, true);
                      let dimRecal = this.getWayfinderDimFromLore(itemStack, true);
                      if (posRecal !== void 0 && dimRecal !== void 0) {
                        if (this.tryTeleportWithCost(player, dimRecal, posRecal, true)) {
                          debug("tp to posRecal: " + posRecal.x + ", " + posRecal.y + ", " + posRecal.z + ", " + dimRecal.id);
                          this.setWayfinderPosToLore(itemStack, void 0, void 0, player.dimension, null);
                          this.echoWayfinderFixTempPlayerID = player.id;
                          this.echoWayfinderFixTempItemStack = itemStack;
                          this.echoWayfinderFixSetLoreDelay = 1;
                          player.setDynamicProperty(this.propPlayerWayfinderUseCooldown, this.playerWayfinderUseCooldownMax);
                          player.setDynamicProperty(this.propPlayerIsUsingWayfinder, false);
                        }
                      } else if (posBound !== void 0 && dimBound !== void 0) {
                        let posPrev = CoroUtil.floor(player.location);
                        let dimPrev = player.dimension;
                        if (this.tryTeleportWithCost(player, dimBound, posBound)) {
                          debug("tp to bound pos " + CoroUtil.vector3ToString(posBound));
                          this.setWayfinderPosToLore(itemStack, void 0, void 0, dimPrev, posPrev);
                          this.echoWayfinderFixTempPlayerID = player.id;
                          this.echoWayfinderFixTempItemStack = itemStack;
                          this.echoWayfinderFixSetLoreDelay = 1;
                          player.setDynamicProperty(this.propPlayerWayfinderUseCooldown, this.playerWayfinderUseCooldownMax);
                          player.setDynamicProperty(this.propPlayerIsUsingWayfinder, false);
                        }
                      }
                    });
                  }
                } else {
                  this.subtitleRawSimple(player, "msg.wayfinder_not_bound");
                }
              }
              if (itemStack.typeId == this.itemNameWayfinderWildcard) {
                const run = system.run(() => {
                  let jsonObj = this.getWaystoneLocationData();
                  let waystones2 = jsonObj.overworld;
                  if (player.dimension.id == "minecraft:nether") {
                    waystones2 = jsonObj.nether;
                  } else if (player.dimension.id == "minecraft:the_end") {
                    waystones2 = jsonObj.the_end;
                  }
                  if (Object.keys(waystones2).length > 0) {
                    let pos = this.getFirstFarAwayWaystone(player, waystones2, 100);
                    if (pos !== void 0) {
                      let posGo = this.getTeleportSpotNextToWaystone(player.dimension, pos);
                      this.teleportWithDelayedSound(player, player.dimension, posGo);
                      if (CoroUtil.getGameMode(player) != GameMode.creative) {
                        CoroUtil.setSlot(player, void 0, EquipmentSlot.Mainhand);
                      }
                    } else {
                      this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.wayfinder_wildcard_cant_find"}]}');
                    }
                  } else {
                    this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.wayfinder_wildcard_cant_find"}]}');
                  }
                });
              }
            }
          } else if (isUsingLecternWayfinder) {
            let jsonString = this.getClosestLecternWayfinderDataToPlayer(player);
            if (jsonString !== void 0 && jsonString !== "") {
              let wayfinderData = JSON.parse(jsonString);
              player.setDynamicProperty(this.propPlayerUsingWayfinderTicks, 0);
              this.tryTeleportWithCost(player, world.getDimension(CoroUtil.dimNumberIDToStringID(wayfinderData.dim)), { x: wayfinderData.x, y: wayfinderData.y, z: wayfinderData.z });
            }
          }
        }
      } else {
        player.setDynamicProperty(this.propPlayerUsingWayfinderTicks, 0);
      }
      if (system.currentTick % 40 == 0) {
        let pos = CoroUtil.getPropVector3OrUndefined(player, this.propPlayerLastWaystoneTPPos);
        let dimString = CoroUtil.getPropStringOrUndefined(player, this.propPlayerLastWaystoneTPDim);
        if (pos !== void 0 && dimString != void 0) {
          let dim2 = world.getDimension(dimString);
          if (CoroUtil.isLoaded(dim2, pos)) {
            let block = CoroUtil.getBlock(dim2, pos);
            if (block !== void 0) {
              if (!this.isWaystone(block)) {
                log("detected missing waystone, destroying wayfinder or removing lore");
                let itemStack = CoroUtil.getSlot(player, EquipmentSlot.Mainhand);
                if (itemStack !== void 0) {
                  if (itemStack.typeId == this.itemNameWayfinderSimple || itemStack.typeId == this.itemNameWayfinderClairvoyant || itemStack.typeId == this.itemNameWayfinderEcho) {
                    if (CoroUtil.getGameMode(player) == GameMode.creative) {
                      itemStack.setLore([]);
                      CoroUtil.setSlot(player, itemStack, EquipmentSlot.Mainhand);
                    } else {
                      CoroUtil.setSlot(player, void 0, EquipmentSlot.Mainhand);
                      this.actionBarRawSimple(player, "msg.waystone_missing");
                    }
                  }
                }
              }
            }
            player.setDynamicProperty(this.propPlayerLastWaystoneTPPos, void 0);
            player.setDynamicProperty(this.propPlayerLastWaystoneTPDim, void 0);
          }
        }
      }
    }
    if (system.currentTick % 20 == 0) {
      this.tickGenAlternator = !this.tickGenAlternator;
      for (const player of players) {
        let dim = player.dimension;
        if (ticksSinceModInit > 200) {
          if (this.tickGenAlternator && dim != world.getDimension("nether")) {
            this.tickPlayerWaystoneGenSurface(player);
          }
          if (!this.tickGenAlternator && dim != world.getDimension("the_end")) {
            this.tickPlayerWaystoneGenCave(player);
          }
        }
      }
    }
    const dimensions = ["overworld", "nether", "the_end"];
    for (const entry of dimensions) {
      this.tickDimension(world.getDimension(entry));
    }
  }
  tickDimension(dim) {
    if (system.currentTick % 10 == 0) {
      let entities = dim.getEntities({ type: this.entityNameWaystoneMasterData });
      for (const data of entities) {
        if (data.dimension != dim)
          continue;
        if (CoroUtil.getPropBool(data, "isOpen")) {
          let player = CoroUtil.getClosestPlayerToPosWithCutoff(CoroUtil.center(data.location), 3.5);
          if (player == void 0) {
            this.closeMasterWaystoneGUI(data, false);
          }
        } else {
          let player = CoroUtil.getClosestPlayerToPosWithCutoff(CoroUtil.center(data.location), 3);
          if (player !== void 0) {
            let posAdjustedToBlockCoord = CoroUtil.uncenter(data.location);
            this.openMasterWaystoneGUI(player.dimension, player, posAdjustedToBlockCoord);
          }
        }
        if (CoroUtil.isLoaded(dim, CoroUtil.up(data.location, 4))) {
          dim.spawnParticle("razz_ew:wayfinder_charge_emit_tiny", CoroUtil.up(data.location, 1.84));
          dim.spawnParticle("razz_ew:waystone_shimmer", CoroUtil.up(data.location, -1));
        }
        let block = CoroUtil.getBlock(dim, data.location);
        if (block !== void 0) {
          if (!block.permutation.matches(this.blockNameWaystoneMasterBase) || !CoroUtil.getBlock(dim, CoroUtil.up(data.location, 1))?.permutation.matches(this.blockNameWaystoneMasterTop)) {
            debug("detected no block for master waystone data, killing entity");
            this.closeMasterWaystoneGUI(data, false);
            CoroUtil.despawnEntity(data);
          }
        }
      }
    }
    if (system.currentTick % 100 == 0) {
      let entities = dim.getEntities({ type: this.entityNameWayfinder });
      for (const entity of entities) {
        if (entity.dimension != dim)
          continue;
        let block = CoroUtil.getBlock(dim, CoroUtil.up(entity.location, -1));
        if (block !== void 0 && !block.permutation.matches("minecraft:lectern")) {
          this.turnWayfinderEntityIntoItem(entity);
        }
      }
    }
  }
  closeMasterWaystoneGUI(data, fastDespawn) {
    let jsonArray = this.getWaystoneJsonData(data);
    let count = 0;
    for (const entry of jsonArray) {
      if (entry.ent_id !== "") {
        let entity = world.getEntity(entry.ent_id);
        if (fastDespawn) {
          entity?.triggerEvent("event:despawn_real");
        } else {
          CoroUtil.despawnEntity(entity);
        }
        let isRight = (count + 1) % 2 == 0;
        entity?.runCommandAsync("playanimation @s " + (!isRight ? "close_right" : "close_left") + ' "" 0 "" ""');
      }
      count++;
    }
    let ent_id_menu = CoroUtil.getPropString(data, this.propMasterWaystoneDataMenuEntID);
    if (ent_id_menu !== "") {
      let entity = world.getEntity(ent_id_menu);
      CoroUtil.despawnEntity(entity);
    }
    data.setDynamicProperty("isOpen", false);
    if (jsonArray.length > 0) {
      if (this.configMasterWaystonePistonNoise) {
        data.runCommandAsync("execute as @a[r=8] at @s run playsound tile.piston.out @s ~ ~ ~ 0.3 1.2");
      }
    }
  }
  isElevator(block) {
    for (const name in elevators) {
      if (block?.permutation.matches(this.blockNameElevatorBase + name) || block?.permutation.matches(this.blockNameElevatorBase + name + "_activated")) {
        return true;
      }
    }
    return false;
  }
  getElevatorOrUndefined(dim, pos) {
    let block = CoroUtil.getBlock(dim, pos);
    if (block === void 0)
      return void 0;
    for (const name in elevators) {
      if (block?.permutation.matches(this.blockNameElevatorBase + name)) {
        return this.blockNameElevatorBase + name;
      } else if (block?.permutation.matches(this.blockNameElevatorBase + name + "_activated")) {
        return this.blockNameElevatorBase + name + "_activated";
      }
    }
    return void 0;
  }
  updateElevatorsActivatedState(dim, pos) {
    this.updateElevatorsActivatedStateInDirection(dim, pos, 1);
    this.updateElevatorsActivatedStateInDirection(dim, pos, -1);
  }
  updateElevatorsActivatedStateInDirection(dim, pos, direction) {
    let posElevatorNeighbor = this.findElevator(dim, pos, direction);
    if (posElevatorNeighbor !== void 0) {
      let blockElevatorNeighborActivated = this.getElevatorOrUndefined(dim, posElevatorNeighbor);
      if (blockElevatorNeighborActivated !== void 0) {
        let posElevatorNeighborToTheNeighbor = this.findElevator(dim, posElevatorNeighbor, direction);
        if (posElevatorNeighborToTheNeighbor === void 0) {
          posElevatorNeighborToTheNeighbor = this.findElevator(dim, posElevatorNeighbor, -direction);
          if (posElevatorNeighborToTheNeighbor === void 0) {
            CoroUtil.setBlockAt(dim, posElevatorNeighbor, blockElevatorNeighborActivated.replace("_activated", ""));
          }
        }
      }
    }
  }
  updateElevatorsDeactivatedState(dim, pos) {
    this.updateElevatorsDeactivatedStateInDirection(dim, pos, 1);
    this.updateElevatorsDeactivatedStateInDirection(dim, pos, -1);
  }
  updateElevatorsDeactivatedStateInDirection(dim, pos, direction) {
    let posElevatorNeighbor = this.findElevator(dim, pos, direction);
    if (posElevatorNeighbor !== void 0) {
      let blockElevatorNeighbor = this.getElevatorOrUndefined(dim, posElevatorNeighbor);
      if (blockElevatorNeighbor !== void 0) {
        if (!blockElevatorNeighbor.includes("_activated")) {
          CoroUtil.setBlockAt(dim, posElevatorNeighbor, blockElevatorNeighbor + "_activated");
        }
        let blockElevatorDeactivated = this.getElevatorOrUndefined(dim, pos);
        if (blockElevatorDeactivated !== void 0) {
          if (!blockElevatorDeactivated.includes("_activated")) {
            CoroUtil.setBlockAt(dim, pos, blockElevatorDeactivated + "_activated");
          }
        }
      }
    }
  }
  findElevator(dim, pos, direction) {
    let found = false;
    let offset = 0;
    let diff = 0;
    while (!found && pos.y + offset < CoroUtil.getMaxWorldHeight(dim) && pos.y + offset > CoroUtil.getMinWorldHeight(dim) + 1 && (this.configElevatorSearchDist == -1 || diff <= this.configElevatorSearchDist)) {
      offset += direction;
      let checkPos = { x: pos.x, y: pos.y + offset, z: pos.z };
      let block = CoroUtil.getBlock(dim, checkPos);
      if (block !== void 0 && this.isElevator(block)) {
        return { x: pos.x, y: checkPos.y, z: pos.z };
      }
      diff++;
    }
    return void 0;
  }
  tickPlayerWaystoneGenSurface(player) {
    let dim = player.dimension;
    let posRegion = this.getRegionFromPos(player.location);
    let propname = this.propGennedWaystonePrefix + dim.id + "_" + posRegion.x + "_" + posRegion.z;
    let region_genned = world.getDynamicProperty(propname);
    if (region_genned) {
    } else {
      let minRange = 64;
      let maxRange = 150;
      let posRegionCenter = { x: posRegion.x * this.waystoneRegionSize + this.waystoneRegionSize / 2, y: 0, z: posRegion.z * this.waystoneRegionSize + this.waystoneRegionSize / 2 };
      let maxDistFromCenter = 196;
      let tryPos;
      for (let i = 0; i < this.configTimesPerIterationToFindGoodXZPosSurface; i++) {
        tryPos = {
          x: player.location.x + Math.random() * maxRange - Math.random() * maxRange,
          y: player.location.y,
          z: player.location.z + Math.random() * maxRange - Math.random() * maxRange
        };
        if (CoroUtil.distXZToCoord(player.location, tryPos) < minRange || CoroUtil.distXZToCoord(posRegionCenter, tryPos) > maxDistFromCenter || !CoroUtil.entityIsInLoadedChunk(dim, tryPos)) {
          tryPos = void 0;
        } else {
          break;
        }
      }
      if (tryPos !== void 0) {
        var ent = dim.spawnEntity(MODID + ":biome_getter", {
          x: tryPos.x,
          y: tryPos.y,
          z: tryPos.z
        });
        let waystone = this.getWaystoneNameFromBiomeGetter(ent);
        CoroUtil.despawnEntity(ent);
        if (waystone !== void 0) {
          var height = this.getSafeSpotToSpawnWaystoneOnSurfaceHeightmapHere(dim, tryPos);
          if (height >= CoroUtil.getMinWorldHeight(dim)) {
            if (CoroUtil.outputDebug)
              player.sendMessage("genned " + waystone + " waystone for surface at " + Math.floor(tryPos.x) + ", " + Math.floor(tryPos.y) + ", " + Math.floor(tryPos.z));
            log("genned " + waystone + " waystone for surface at " + Math.floor(tryPos.x) + ", " + Math.floor(tryPos.y) + ", " + Math.floor(tryPos.z));
            CoroUtil.setBlockAt(player.dimension, {
              x: tryPos.x,
              y: height,
              z: tryPos.z
            }, MODID + ":waystone_biome_" + waystone + "_base");
            CoroUtil.setBlockAt(player.dimension, {
              x: tryPos.x,
              y: height + 1,
              z: tryPos.z
            }, MODID + ":waystone_biome_" + waystone + "_pillar");
            this.addWaystoneLocation(dim, {
              x: tryPos.x,
              y: height + 1,
              z: tryPos.z
            });
            CoroUtil.setPropSafe(world, propname, true);
          }
        } else {
          log("failed to find a good spot for surface waystone");
        }
      } else {
        log("failed to find a good spot for surface waystone within good distances");
      }
    }
  }
  tickPlayerWaystoneGenCave(player) {
    if (player.location.y > 55 && player.dimension.id == "minecraft:overworld")
      return;
    let dim = player.dimension;
    let posRegion = this.getRegionFromPos(player.location);
    let propname = this.propGennedWaystoneCavePrefix + dim.id + "_" + posRegion.x + "_" + posRegion.z;
    let region_genned = world.getDynamicProperty(propname);
    if (region_genned) {
    } else {
      let minRange = 64;
      let maxRange = 150;
      let rangeY = 4;
      let posRegionCenter = { x: posRegion.x * this.waystoneRegionSize + this.waystoneRegionSize / 2, y: 0, z: posRegion.z * this.waystoneRegionSize + this.waystoneRegionSize / 2 };
      let maxDistFromCenter = 196;
      let tryPos;
      for (let i = 0; i < this.configTimesPerIterationToFindGoodXZPosCave; i++) {
        tryPos = {
          x: player.location.x + Math.random() * maxRange - Math.random() * maxRange,
          y: player.location.y + Math.random() * rangeY,
          z: player.location.z + Math.random() * maxRange - Math.random() * maxRange
        };
        if (CoroUtil.distXZToCoord(player.location, tryPos) < minRange || CoroUtil.distXZToCoord(posRegionCenter, tryPos) > maxDistFromCenter || !CoroUtil.entityIsInLoadedChunk(dim, tryPos)) {
          tryPos = void 0;
        } else {
          break;
        }
      }
      if (tryPos !== void 0) {
        var ent = dim.spawnEntity(MODID + ":biome_getter", {
          x: tryPos.x,
          y: tryPos.y,
          z: tryPos.z
        });
        let waystone = this.getWaystoneNameFromBiomeGetter(ent);
        CoroUtil.despawnEntity(ent);
        if (waystone !== void 0 && (waystone == "lush_caves" || waystone == "basalt_deltas")) {
          var height = this.getSafeSpotToSpawnWaystoneSolidGrowndBelowHere(dim, tryPos);
          if (height >= CoroUtil.getMinWorldHeight(dim)) {
            if (CoroUtil.outputDebug)
              player.sendMessage("genned " + waystone + " waystone for caves at " + Math.floor(tryPos.x) + ", " + Math.floor(tryPos.y) + ", " + Math.floor(tryPos.z));
            debug("genned " + waystone + " waystone for caves at " + Math.floor(tryPos.x) + ", " + Math.floor(tryPos.y) + ", " + Math.floor(tryPos.z));
            CoroUtil.setBlockAt(player.dimension, {
              x: tryPos.x,
              y: height,
              z: tryPos.z
            }, MODID + ":waystone_biome_" + waystone + "_base");
            CoroUtil.setBlockAt(player.dimension, {
              x: tryPos.x,
              y: height + 1,
              z: tryPos.z
            }, MODID + ":waystone_biome_" + waystone + "_pillar");
            this.addWaystoneLocation(dim, {
              x: tryPos.x,
              y: height + 1,
              z: tryPos.z
            });
            CoroUtil.setPropSafe(world, propname, true);
          }
        } else {
        }
      } else {
      }
    }
  }
  getBiomeFromBiomeGetter(ent) {
    let biome_id = "none";
    for (let i = 0; i < 6; i++) {
      biome_id = ent.getProperty(MODID + ":biome_id_" + i);
      if (biome_id !== "none" && biome_id !== void 0) {
        break;
      }
    }
    return biome_id;
  }
  getWaystoneNameFromBiomeGetter(ent) {
    let biome_id = "none";
    for (let i = 0; i < 6; i++) {
      biome_id = ent.getProperty(MODID + ":biome_id_" + i);
      if (biome_id !== "none" && biome_id !== void 0) {
        break;
      }
    }
    let theme_name = this.getBiomeThemeFromBiome(biome_id);
    if (theme_name !== void 0) {
      if (theme_name in biome_themes_to_waystone) {
        let waystone = biome_themes_to_waystone[theme_name];
        return waystone;
      } else {
        err("failed to get waystone from biome theme: " + theme_name);
      }
    } else {
      err("failed to get a biome theme from biome id: " + biome_id);
    }
    return void 0;
  }
  getBiomeThemeFromBiome(biome_id_to_find) {
    for (const theme_name in biome_themes_from_biome) {
      let biome_names = biome_themes_from_biome[theme_name];
      for (const biome_id of biome_names) {
        if (biome_id_to_find == biome_id) {
          return theme_name;
        }
      }
    }
    return void 0;
  }
  getTeleportSpotNextToWaystone(dim, posWaystone) {
    let posFinal = CoroUtil.add(CoroUtil.centerXZ(posWaystone), 1, 0, 0);
    return posFinal;
  }
  tryTeleportWithCost(player, dim, pos, notToWaystone) {
    let creative = CoroUtil.getGameMode(player) == GameMode.creative;
    let xpCost = this.getTeleportCost(player.dimension, player.location, dim, pos);
    if (player.level >= xpCost || creative) {
      if (!creative)
        player.addLevels(-xpCost);
      player.setDynamicProperty(this.propPlayerIsUsingWayfinder, false);
      if (notToWaystone) {
        this.teleportWithDelayedSound(player, dim, CoroUtil.centerXZ(pos));
      } else {
        this.teleportWithDelayedSound(player, dim, this.getTeleportSpotNextToWaystone(dim, pos));
        player.setDynamicProperty(this.propPlayerLastWaystoneTPPos, pos);
        player.setDynamicProperty(this.propPlayerLastWaystoneTPDim, dim.id);
      }
      return true;
    } else {
      player.setDynamicProperty(this.propPlayerTitleTimes, this.titleTimesMax);
      this.actionBarRaw(player, '{"rawtext":[{"translate":"msg.wayfinder_experience"}, {"text": " ' + xpCost + '"}]}');
      return false;
    }
  }
  teleportWithDelayedSound(player, dim, pos) {
    player.teleport(pos, { dimension: dim });
    system.runTimeout(() => {
      player.playSound("mob.endermen.portal", { location: pos });
      if (CoroUtil.isLoaded(dim, pos)) {
        dim.spawnParticle("razz_ew:wayfinder_charge_explode_small", pos);
      } else {
        debug("tp destination not loaded for particle: " + CoroUtil.vector3ToString(pos));
      }
    }, 3);
  }
  addWaystoneLocation(dim, pos) {
    pos = CoroUtil.floor(pos);
    let jsonObj = this.getWaystoneLocationData();
    let waystones2 = jsonObj.overworld;
    if (dim.id == "minecraft:nether") {
      waystones2 = jsonObj.nether;
    } else if (dim.id == "minecraft:the_end") {
      waystones2 = jsonObj.the_end;
    }
    let posString = CoroUtil.vector3ToString(pos);
    if (waystones2[posString] == void 0) {
      waystones2[posString] = true;
      debug("added new waystone entry: " + posString + ", entry count for this dim: " + Object.keys(waystones2).length);
    } else {
      debug("already exists: " + posString);
    }
    let jsonString = JSON.stringify(jsonObj);
    log("new json char length: " + jsonString.length + " - " + jsonString.length / CoroUtil.propStringLengthLimit * 100 + "%");
    CoroUtil.setPropSafe(world, this.propWaystoneLocations, jsonString);
  }
  deleteFromObject(keyPart, obj) {
    for (var k in obj) {
      if (~k.indexOf(keyPart)) {
        delete obj[k];
      }
    }
  }
  removeWaystoneLocation(dim, pos) {
    pos = CoroUtil.floor(pos);
    let jsonObj = this.getWaystoneLocationData();
    let waystones2 = jsonObj.overworld;
    if (dim.id == "minecraft:nether") {
      waystones2 = jsonObj.nether;
    } else if (dim.id == "minecraft:the_end") {
      waystones2 = jsonObj.the_end;
    }
    let posString = CoroUtil.vector3ToString(pos);
    if (waystones2[posString] !== void 0) {
      this.deleteFromObject(posString, waystones2);
      debug("removed waystone entry: " + posString + ", entry count: " + Object.keys(waystones2).length);
    } else {
      debug("doesnt exist in array: " + posString);
    }
    CoroUtil.setPropSafe(world, this.propWaystoneLocations, JSON.stringify(jsonObj));
  }
  getWaystoneLocationData() {
    let jsonObj = {
      overworld: {},
      nether: {},
      the_end: {}
    };
    let jsonStr = CoroUtil.getPropString(world, this.propWaystoneLocations);
    if (jsonStr !== "") {
      jsonObj = JSON.parse(jsonStr);
    }
    return jsonObj;
  }
  isWaystone(block) {
    if (block?.permutation.matches(this.blockNameWaystoneMasterBase) || block?.permutation.matches(this.blockNameWaystoneMasterTop)) {
      return true;
    }
    for (const waystone_name in waystones.naturally_generated) {
      let waystone_data = waystones.naturally_generated[waystone_name];
      if (block?.permutation.matches(MODID + ":waystone_biome_" + waystone_name + "_pillar") || block?.permutation.matches(MODID + ":waystone_biome_" + waystone_name + "_pillar_activated")) {
        return true;
      }
    }
    for (const waystone_name in waystones.player) {
      let waystone_data = waystones.player[waystone_name];
      if (block?.permutation.matches(MODID + ":waystone_player_" + waystone_name) || block?.permutation.matches(MODID + ":waystone_player_" + waystone_name + "_activated")) {
        return true;
      }
    }
    return false;
  }
  isWaystoneActivated(block) {
    for (const waystone_name in waystones.naturally_generated) {
      let waystone_data = waystones.naturally_generated[waystone_name];
      if (block?.permutation.matches(MODID + ":waystone_biome_" + waystone_name + "_pillar_activated")) {
        return true;
      }
    }
    for (const waystone_name in waystones.player) {
      let waystone_data = waystones.player[waystone_name];
      if (block?.permutation.matches(MODID + ":waystone_player_" + waystone_name + "_activated")) {
        return true;
      }
    }
    return false;
  }
  turnWayfinderEntityIntoItem(entity) {
    if (entity === void 0)
      return;
    try {
      let jsonString = CoroUtil.getPropString(entity, this.propWayfinderEntityData);
      log("data: " + jsonString);
      if (jsonString !== "") {
        let wayfinderData = JSON.parse(jsonString);
        let itemStack = new ItemStack(wayfinderData.wayfinder_id);
        let posRecall = void 0;
        let dimRecall = void 0;
        if (wayfinderData.y_recall !== -999) {
          posRecall = { x: wayfinderData.x_recall, y: wayfinderData.y_recall, z: wayfinderData.z_recall };
          dimRecall = world.getDimension(CoroUtil.dimNumberIDToStringID(wayfinderData.dim_recall));
        }
        this.setWayfinderPosToLore(itemStack, world.getDimension(CoroUtil.dimNumberIDToStringID(wayfinderData.dim)), { x: wayfinderData.x, y: wayfinderData.y, z: wayfinderData.z }, dimRecall, posRecall);
        entity.dimension.spawnItem(itemStack, entity.location);
      }
      log("despawn: " + entity.id);
      CoroUtil.despawnEntity(entity);
      const run = system.runTimeout(() => {
        if (entity !== void 0 && entity.isValid()) {
          entity.kill();
        }
      }, 5);
    } catch (e) {
      err("bedrock being bedrock: " + e.message);
    }
  }
  getTeleportCost(dimFrom, posFrom, dimTo, posTo) {
    if (dimFrom !== dimTo) {
      return 3;
    }
    let dist = CoroUtil.distToCoord(posFrom, posTo);
    if (dist < 250)
      return 1;
    if (dist < 500)
      return 2;
    return 3;
  }
  getClosestLecternWayfinderToPlayer(player) {
    let entities = player.dimension.getEntities({ type: this.entityNameWayfinder, closest: 1, location: player.location, maxDistance: 3 });
    if (entities.length > 0) {
      let ent = entities[0];
      return ent;
    }
    return void 0;
  }
  getClosestLecternWayfinderDataToPlayer(player) {
    let ent = this.getClosestLecternWayfinderToPlayer(player);
    if (ent !== void 0) {
      return CoroUtil.getPropString(ent, this.propWayfinderEntityData);
    }
    return void 0;
  }
  setPlayerUsedWayfinderOnBlock(player) {
    player.setDynamicProperty(this.propPlayerItemWasUsedOnBlock, true);
  }
  getPlayerUsedWayfinderOnBlock(player) {
    return CoroUtil.getPropBool(player, this.propPlayerItemWasUsedOnBlock);
  }
  isPosReplaceableBlockOrAir(dim, pos) {
    let block = CoroUtil.getBlock(dim, pos);
    if (block?.isAir)
      return true;
    for (var entry of blocks_allowed_to_gen_over) {
      if (block?.permutation.matches("minecraft:" + entry)) {
        return true;
      }
    }
    return false;
  }
}
export {
  ExplorersWayStones,
  PlayerData
};
