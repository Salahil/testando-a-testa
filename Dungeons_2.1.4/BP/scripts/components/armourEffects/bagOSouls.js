import {
    world,
    system,
    EntityDamageCause
} from "@minecraft/server";

import { isWearingSet } from "components/armour.js"
import {getSoulBarText} from "misc/soulManager.js"

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const wearing = isWearingSet(player, "dungeons:bag_o_souls")
        if (!wearing) continue;
        system.runTimeout(() => {
            if (!isWearingSet(player, "dungeons:bag_o_souls")) {
                // [PATCH Clebao] O original criava 100 runInterval (periodos 0..99) que drenavam
                // a barra ate 100 e depois ficavam vivos PARA SEMPRE (so retornavam pelo "lock").
                // Cada vez que alguem tirava o set: +100 loops permanentes ate fechar o mundo.
                // Agora: 1 unico loop com a mesma velocidade de drenagem (~6 por tick) que se
                // encerra sozinho ao chegar em 100 (ou se o jogador sair).
                const drain = system.runInterval(() => {
                    try {
                        const obj = world.scoreboard.getObjective('soulGauge')
                        if (!player.isValid || !obj) { system.clearRun(drain); return; }
                        const score = obj.getScore(player)
                        if (score === undefined || score <= 100) {
                            player.onScreenDisplay.setActionBar(getSoulBarText(player, false))
                            system.clearRun(drain)
                            return;
                        }
                        obj.addScore(player, -Math.min(6, score - 100))
                        player.onScreenDisplay.setActionBar(getSoulBarText(player, true))
                    } catch (e) { system.clearRun(drain) }
                }, 1)
            }
        }, 1)
    }
});