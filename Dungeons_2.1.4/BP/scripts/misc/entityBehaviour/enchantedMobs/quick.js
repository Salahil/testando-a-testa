import {
    world,
    system,
    DimensionTypes
} from "@minecraft/server";

const id = "quick"

system.runInterval(() => {
    const dims = []
    for (const player of world.getPlayers()) if (!dims.includes(player.dimension.id)) dims.push(player.dimension.id)
    for (const dimensionType of dims) {
        const dim = world.getDimension(dimensionType)
        for (const entity of dim.getEntities({ families: ["enchanted"], tags: ["dungeons:enchanted_mob_" + id] })) {
            if (dim.isChunkLoaded(entity.location)) {
                // [PATCH Clebao] antes reaplicava o efeito (pacote para os clientes) todo tick.
                // Agora so reaplica se o efeito sumiu, enfraqueceu ou esta acabando.
                const speed = entity.getEffect("speed")
                if (!speed || speed.amplifier < 2 || speed.duration < 200)
                    entity.addEffect("speed", 999999, { amplifier: 2, showParticles: false })
            }
        }
    }
})