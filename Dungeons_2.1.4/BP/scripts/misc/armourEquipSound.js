import {
    world,
    system
} from "@minecraft/server";

function playsound(player, item) {
    if (item.typeId.includes("dungeons:") == false) return;
    var id = item.typeId.replace("_boots", "").replace("_leggings", "").replace("_chestplate", "").replace("_helmet", "").replace("dungeons:", "")
    if(id.includes("mystery_")) id = "mystery"
    var pitch = Math.random() * 0.6 + 0.7
    if(id.includes("sweet_tooth")) pitch = Math.max(pitch, 0.9 + Math.random()*0.2)
    player.dimension.playSound("armour.equip." + id, player.location, { volume: 0.5, pitch: pitch })
}

// [PATCH Clebao] Antes: por jogador, a cada tick, lia as 4 pecas, agendava um runTimeout e lia
// as 4 de novo no tick seguinte (8 leituras + 1 closure por jogador por tick). Agora compara
// com o que foi visto no tick anterior (4 leituras, sem timeout). Mesmo resultado: o som toca
// quando a peca de um slot muda de tipo.
const SLOTS = ["Head", "Chest", "Legs", "Feet"]
const lastArmour = new Map() // playerId -> [typeId|undefined x4]
world.afterEvents.playerLeave.subscribe((e) => lastArmour.delete(e.playerId))

system.runInterval(() => {
    for (const player of world.getPlayers({ excludeGameModes: ["Spectator"] })) {
        const equippable = player.getComponent("equippable")
        if (!equippable) continue;
        const prev = lastArmour.get(player.id)
        const now = []
        for (let i = 0; i < 4; i++) {
            const item = equippable.getEquipment(SLOTS[i])
            now.push(item?.typeId)
            if (prev && item && prev[i] !== item.typeId) playsound(player, item)
        }
        lastArmour.set(player.id, now)
    }
})