# Patches de desempenho: mundo "Clebão!"

Os patches valem para **exatamente estas versões** (as que foram enviadas para análise):

| Pack | Versão | UUID |
|---|---|---|
| Improvised Guns BP / RP | 3.0.5 | b4ca2f59… / 1d4a303d… |
| Alylica's Dungeons BP | 2.1.4 | 2c5e0de8… |
| Core Craft BP / RP | 1.2.9 | d4ffea2a… / 5a8ed887… |
| The Explorers Waystones BP | 1.0.3 | 0693c314… |
| Easter Eggs Rename A&S RP | 1.8.2 | 9816faa0… |

Cada pasta contém **só os arquivos alterados**, no mesmo caminho do pack original.
Nada aqui altera ou apaga dados do mundo, entidades ou packs.
Actions & Stuff e Villager News **não** foram modificados.

---

## Como aplicar no PC host

**Antes:** faça backup do mundo (Editar → Exportar) e feche o Minecraft.

### Opção A: script (recomendado)
1. Copie a pasta `_patches_clebao` inteira para o PC host.
2. Abra o PowerShell dentro dela.
3. Rode a simulação: `powershell -ExecutionPolicy Bypass -File .\aplicar_patches.ps1`. Ela mostra o que faria e não grava nada.
4. Aplique um pack por vez, por exemplo: `... -File .\aplicar_patches.ps1 -Aplicar -Somente ImprovisedGuns`.
5. Para desfazer tudo: `... -File .\aplicar_patches.ps1 -Reverter`.

O script só mexe em packs com **o mesmo UUID e a mesma versão** da tabela acima. Se a versão instalada for outra, ele pula.
Antes de sobrescrever, salva o original como `<arquivo>.orig_clebao`.
Os ajustes da pasta `_opcional` só entram com `-Opcional`.

### Opção B: manual
Abra `%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang\behavior_packs\` (ou `resource_packs\`).
Ache a pasta do pack conferindo `uuid` e `version` no `manifest.json`.
Copie o arquivo original para `.orig` e cole o do patch por cima.

---

## O que mudou em cada arquivo

### 1. Improvised Guns 3.0.5

| Arquivo | Mudança | Por quê | Risco |
|---|---|---|---|
| `ImprovisedGunsBP/scripts/vgGunHandle.js` | O loop do "dano em cadeia" agora acompanha só as entidades atingidas por bala. | Antes, **a cada tick**, buscava todas as entidades das 3 dimensões, sem filtro, e lia uma propriedade de cada uma, mesmo sem ninguém atirando. Era o loop mais caro do pack. A regra continua igual: 8 ticks sem novo acerto zeram a cadeia. | Baixo |
| `ImprovisedGunsBP/scripts/revZoom.js` | A animação de empunhar só é reenviada quando muda, ou a cada ~2 s. | Antes ia um pacote de animação para todos os clientes a cada 5 ticks enquanto alguém segurava uma arma. | Baixo |
| `ImprovisedGunsBP/entities/projectiles/*.json` (8) | Removidos `leaves` e `leaves2`; `wooden_door` virou `oak_door`. | Esses nomes de bloco não existem mais e geravam o erro "Block type doesn't exist". | Baixo |
| `ImprovisedGunsBP/entities/firearm_forger.json` | `"cause": "any"` virou `"all"`. | `any` não existe ("Damage Source not found"). A forja tem 1 de vida, e a proteção contra dano não funcionava. Agora ela é invulnerável, como o autor pretendia; quebrar o bloco continua removendo a forja. | Baixo |
| `ImprovisedGuns/entity/firearm_forger.json` (RP) | Definição de cliente recriada, mínima e invisível. | O arquivo original vinha corrompido: era só um `{"__error__": …}` deixado por uma ferramenta de conversão. Ele gerava o aviso de format_version. | Baixo |

### 2. Alylica's Dungeons 2.1.4

| Arquivo | Mudança | Por quê | Risco |
|---|---|---|---|
| `scripts/components/armour.js` | Cache das 4 peças de armadura por entidade por tick. | `isWearingSet` / `isWearingMysteryArmour` são chamados ~146 vezes, em 17 loops de 1 tick e nos handlers de dano. Cada chamada fazia 5 chamadas nativas. | Baixo: troca de armadura percebida com até 1 tick de atraso |
| `scripts/components/armourEffects/bagOSouls.js` | Um único loop de drenagem, que se encerra sozinho. | **Vazamento:** cada vez que alguém tirava o set, nasciam 100 loops que nunca paravam, até fechar o mundo. A velocidade de drenagem (~6/tick) é a mesma. | Baixo |
| 43 arquivos com `dataDrivenEntityTrigger` | Ganharam o filtro nativo `{ eventTypes: [...] }` em 85 dos 100 handlers. | Antes, **qualquer** evento de **qualquer** mob chamava os 100 handlers. O slime tropical sozinho dispara um evento por tick. O filtro só foi colocado onde o handler comprovadamente ignora os outros eventos. Os 15 restantes não mudaram. | Baixo |
| `scripts/components/ranged.js` | O timer de "flecha no chão" só percorre dimensões com jogador. | Antes percorria **todas** as dimensões registradas a cada tick. | Baixo |
| `scripts/advancements/speedOfTheWind.js` | Roda a cada 20 ticks (−20 por vez), só onde há jogador. | Antes gravava uma propriedade por golem a cada tick, em todas as dimensões. A janela de 2 minutos é a mesma. | Baixo |
| `scripts/dimensionRegistry/main.js` | `ancient_portal_travel_time` só é gravado se mudou. | Antes era uma gravação persistente por jogador a cada tick, mesmo longe de portal. | Baixo |
| `scripts/misc/entityBehaviour/enchantedMobs.js` | Partículas só para mobs encantados a até 64 blocos de algum jogador. HUD do mob encantado a cada 4 ticks. Filtro nativo no handler de pet. | Antes eram 2 pacotes de partícula por mob encantado por tick, a qualquer distância, e 1 raycast de 32 blocos por jogador por tick. | Baixo: só visual |
| `scripts/misc/entityBehaviour/enchantedMobs/quick.js` | Só reaplica `speed` se o efeito sumiu ou enfraqueceu. | Antes reaplicava `speed 999999` a cada tick em cada mob "quick". | Baixo |
| `scripts/misc/armourEquipSound.js` | Compara com o tick anterior, sem `runTimeout`. | Antes eram 8 leituras de equipamento e 1 timeout por jogador por tick. O som toca nos mesmos casos. | Baixo |

### 3. Core Craft 1.2.9

| Arquivo | Mudança | Por quê | Risco |
|---|---|---|---|
| `BP_CCR_CCR/scripts/main.js` | 4 loops de 1 tick ficam mais espaçados: cache de entidades a cada 2t, inventário a cada 2t, placas de pressão a cada 4t (e só entidades no chão), olho do watcher a cada 4t. | O cache varria todas as entidades das 3 dimensões a cada tick, e as placas testavam o bloco sob cada entidade a cada tick. Confirmei que cada alteração está dentro de um `runInterval`. | Médio-baixo: placa e olho do watcher reagem até 4 ticks (0,2 s) depois |
| `RP_CCR_CCR/blocks.json` | Removida a chave `textures` de 8 blocos (ruby, umbral/gilded end stone, endergloom stem, voidshard block). | Os blocos já definem a mesma textura no BP. Isso elimina os avisos de Geometry, sem mudança visual. | Baixo |

### 3b. Core Craft 1.2.9: despawn de gaivotas e corvos (autorizado com "exterminar")

Pasta separada: `CoreCraft_1.2.9_despawn`. Aplique sozinha com `-Somente CoreCraft_1.2.9_despawn`.

| Arquivo | Mudança | Proteções |
|---|---|---|
| `BP_CCR_CCR/entities/icslz4n2.json` (`cc:seagull`) | Ganhou `minecraft:despawn` no padrão dos monstros vanilla: só a mais de 32 blocos de qualquer jogador, depois de um tempo parado, com chance aleatória (ou imediato a mais de 128 blocos). | Não somem: gaivotas **com nome**, presas na corda, persistentes, **procurando item** ou **carregando item roubado**. Assim nenhum item roubado se perde. |
| `BP_CCR_CCR/entities/6czfxm7k.json` (`cc:raven`) | Mesmo despawn. | Não somem: corvos com nome, presos na corda ou persistentes. |

**Sereias (`cc:mermaid`) não foram alteradas**, porque fazem papel de aldeão.

O que esperar:
- As 66 gaivotas e os 61 corvos salvos somem **aos poucos**, à medida que algum jogador chega perto (até a distância de simulação), mas não perto demais (mais de 32 blocos) da região onde eles estão. Ninguém vê um mob sumir na frente.
- Gaivotas continuam nascendo normalmente nas praias. Com o opcional `density_limit`, nascem menos.
- Corvos de templo e de outpost **não voltam a nascer** nessas estruturas, porque o reabastecimento do spawner não inclui corvos.
- **Irreversível:** reverter o patch impede novos despawns, mas não traz de volta os que já sumiram.
- Para guardar uma gaivota ou um corvo específico, dê um nome com nametag.

### 4. The Explorers Waystones 1.0.3

| Arquivo | Mudança | Por quê | Risco |
|---|---|---|---|
| `WaystonesBP/blocks/elevators/*_a*.json` (16) | O caminho do loot aponta para o arquivo que existe. | Elevadores ativados não dropavam nada ao serem quebrados (erros "Invalid asset path"). | Baixo |
| `WaystonesBP/scripts/razz_ew/ExplorersWaystones.js` | Propriedades do jogador só são gravadas quando o valor muda. | Antes eram 1 gravação por jogador por tick, mais 2 a cada 5 ticks, mesmo sem mudança. | Baixo |

### 5. Easter Eggs Rename A&S 1.8.2

| Arquivo | Mudança | Por quê | Risco |
|---|---|---|---|
| `texts/{en_US,es_MX,ru_RU,zh_CN,zh_TW}.lang` | 149 linhas decorativas (`§6 End`, `// …`) viraram comentário `##`. | Elas geravam os avisos `[Localization] Invalid lang file format`. Nenhuma tradução foi alterada. | Baixo |
| 8 imagens `.png` (pack_icon, item_finder, joinleave, plushes 1/2, template_nocks, costumes/2, ui/keyboard) | Convertidas para PNG de verdade, com visual idêntico. | Eram JPEGs com extensão `.png`. Uma delas substitui uma textura de UI do vanilla. | Baixo |

### `_opcional/` (mudam um pouco o visual ou o spawn; só com `-Opcional`)

| Arquivo | Mudança | Efeito |
|---|---|---|
| `CoreCraft_1.2.9/BP_CCR_CCR/features/dripice_scatter.json`, `ice_cave_ice_scatter.json` | iterations 80→40 e 100→50 | ~4× menos trabalho ao gerar chunks frios. Menos gelo decorativo em cavernas **novas**. |
| `.../feature_rules/*umbral*_rule.json`, `end_gilded_end_stone_rule.json` | iterations 1000→400 | Geração mais leve no End **novo**, com um pouco menos dessas pedras. |
| `.../feature_rules/bee_nest_habitat_rule.json` | iterations 1000→300 | Menos ninhos de abelha em florestas floridas **novas**. O mundo já tem 437 abelhas salvas. |
| `.../spawn_rules/i425c1xn.json` (gaivota) | `density_limit` surface 8 | Limita **novos** spawns. Não remove as gaivotas que já existem. |
| `CoreCraft_1.2.9/RP_CCR_CCR/particles/8bag1qrl.json`, `9xo92vqc.json` | max_particles 2000→300, taxa 600→120 | Escorpião e suricato cavando geram menos partículas. Melhora o FPS. |

---

## Teste no host (um pack por vez)

Teste padrão, antes e depois: tempo da fornalha (10 s = normal), reação da vaca ao trigo, travadas em 5 minutos e erros no content log.

| Pack | Conferir que nada quebrou |
|---|---|
| Improvised Guns | Atirar várias vezes seguidas num mob (o dano acumula). Atirar em vidro e folhas (quebram). Forja de armas: abre a troca e some ao quebrar o bloco. Segurar arma (animação de empunhar). |
| Dungeons | Usar 2 ou 3 sets de armadura com efeito passivo. Vestir e tirar o Bag o' Souls (a barra de almas desce até 100). Lutar com mob encantado (partículas e HUD). Chefes e Ancient Hunts. |
| Core Craft | Placa de pressão customizada. Olho do watcher. Inventário/itens temporários. Blocos de rubi e end stone com textura normal. |
| Waystones | Quebrar um elevador ativado (dropa). Wayfinder mostra o destino. |
| EasterEggs | Tela "Como Jogar" (guia do pack) abre com as imagens. |
