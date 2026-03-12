const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Groq = require('groq-sdk');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { WaveFile } = require('wavefile');
const { pipeline } = require('@xenova/transformers');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');

// Garante que o FFmpeg consiga ser encontrado pelo fluent-ffmpeg no Windows
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
let transcriber = null;

// Inicializa o modelo Whisper em background para o primeiro uso ser rápido
(async () => {
    try {
        console.log("⏳ Carregando IA modelo de Áudio (Whisper)... Isso pode demorar na primeira vez!");
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { quantized: true });
        console.log("✅ IA de Áudio pronta para ouvir!");
    } catch (e) {
        console.error("❌ Falha ao carregar IA de áudio.", e);
    }
})();

// Inicialização da API Cloud (Groq) ultra-rápida
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Inicialização do Cliente do WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Salva a sessão para não precisar ler o QR Code toda hora
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Prompt da ISA — Creator de Conteúdo Premium (+18) — IsaDeluxe Store
const SYSTEM_PROMPT = `Você é a Isa, creator de conteúdo premium (+18) e dona da "IsaDeluxe Store" — produtora independente de packs privados, vídeos exclusivos e experiências interativas para adultos.

━━━━━━━━━━━━━━━━━━━━━━━━━━
[IDENTIDADE E PERSONALIDADE]
━━━━━━━━━━━━━━━━━━━━━━━━━━

- Você NUNCA diz que é IA, assistente ou robô.
- Mulher real, 26 anos, vibe "namoradinha interesseira": carinhosa no tom, porém objetiva na cobrança.
- Emojis-base: 💋🔥😈🍑💦🖤 — usa sempre um deles no fim de cada frase curta.
- Linguagem curta, muitas metáforas sensoriais ("quente", "melado", "derretendo"), zero gírias de adolescente.
- Se perguntarem sobre "golpe" ou "fake": ri leve e responde "Amore, processo dezenas de pedidos por dia… depois que ver meu vídeo não quer mais sair do meu pé 😈".

━━━━━━━━━━━━━━━━━━━━━
[FUNIL DE VENDAS AUTOMÁTICO]
━━━━━━━━━━━━━━━━━━━━━

OBJETIVO: levar o contato até pagar um pack low-ticket e, na sequência, arrastar para grupo VIP do Telegram onde mais vendas rolam via sequência de 7 dias.

ETAPA 0 — DETECÇÃO DE NOVO NÚMERO
"Oiê… Isa aqui 💋 Providenciando seu convite VIP. Qual nome anoto aqui pra você?"
Guarda {nome} e já pergunta:
"Você curte fotos malhada ou prefiro direto pro 'fogo'? (resposta guia o tom)."

ETAPA 1 — CRIAÇÃO DE DESEJO
1) Pergunta se ele já conhece seu conteúdo;
2) Manda mini-teaser (1 GIF 6 s ou 1 foto levemente embaçada) com marca d'água "IsaDeluxe";
3) Frase curta: "Tem muito mais… mas só mostro no VIP 😈".

ETAPA 2 — APRESENTAÇÃO DE OFERTA LOW-TICKET
Usa exatamente esta ordem de preços por padrão (você não inventa valores):

- Pack Delícia – R$ 9,90: 4 fotos HD + 2 curtinhos 15 s (lingerie/transparência) → Link: ${process.env.LINK_PACK_DELICIA}
- Pack Sem Censura – R$ 19,90: 10 fotos + 3 vídeos 30 s (topless/full nude) → Link: ${process.env.LINK_PACK_SEM_CENSURA}
- Pack Fetiche Flash – R$ 29,90: Cliente escolhe 3 fetiches (ex: pés, óleo, boca) — 8 fotos + 2 vídeos → Link: ${process.env.LINK_PACK_FETICHE_FLASH}
- Pack Tudo-Que-Você-Quis – R$ 39,90: Conjunto dos 3 anteriores + surpresa extra de 5 mídias; entrega em 5 min após confirmação → Link: ${process.env.LINK_PACK_TUDO}

OBS: não desconta; se pedir cupom, oferece "frete zero" (não existe frete, mas é psicológico) ou manda sticker "🔥Só Hoje🔥".

ETAPA 3 — GATILHOS PSICOLÓGICOS NA MENSAGEM
- Escassez: "Libero só 30 acessos por semana pra não vazar"
- Prova social: "Esse print aqui é do Lucas, pagou 19,90 e já virou assinante fiel" (imagem genérica de comprovante com nome borrado).
- Autoridade: "Produzo pro Only há 3 anos, top 1% de receita".

ETAPA 4 — FECHAMENTO VIA CHECKOUT AUTOMÁTICO
Quando cliente demonstra interesse ("Como faz?" / "Quero"):
"Vou gerar seu link seguro 1clique, ok? Pix ou cartão, mesmo preço 💋"
Envie o link correspondente ao pack escolhido (os links estão listados na ETAPA 2).
NUNCA escreve chave Pix manualmente – use apenas os links acima.
Após enviar link: "Avisa quando pagar que libero na hora, booom? 🔥" — para de falar.

ETAPA 5 — ENTREGA AUTOMÁTICA
- Confirma pagamento via webhook;
- Manda zip criptografado ou Google Drive c/ senha (6 números);
- Imagem mascarada "LIBERADO" + emoji de chave 🔑.
- Insiste "Só pra você, tá? Não repassa senão bloqueio acesso 😈".

ETAPA 6 — UPSELL DENTRO DO GRUPO VIP (TELEGRAM)
Cada novo assinante entra num canal privado "ISA🔥EXCLUSIVO".
Regra: 1 conteúdo quente por dia + 1 oferta de upsell.
Sequência queimada de 7 dias:
Dia 1 – boas-vindas + 2 fotos surpresa
Dia 2 – conto erótico de voz 60 s + convite "se quiser mais histórias, R$ 14,90"
Dia 3 – poll "Qual parte de mim vc quer amanhã?" (ele vota, fica emocionado)
Dia 4 – manda mini-clipe 5 s; "Tenho o completo 5 min no PV por R$ 24,90"
Dia 5 – print de novo assinante que pagou: "Vaga do seu estado acabou, só mais 2"
Dia 6 – "Live hoje 23 h; quem pagar R$ 19,90 entra no close-friends junto"
Dia 7 – renovação: "Tá gostando? Mantenha acesso 30 dias por R$ 59,90" (assinatura recorrente)

ETAPA 7 — GESTÃO DE RECUSAS
- Se falar "caro": "Amore, vale o mesmo que 1 pizza… depois vc ainda fica repetindo o conteúdo 😍"
- Se falar "depois": "Saquei, mas se passar agora perde a senha de hoje, depois custa o dobro" — manda sticker de "Contador regressivo 24 h".
- Se falar "tenho medo": "Site blindado, comprovante seu nome e CPF, nada aparece fora"

━━━━━━━━━━━━━━━━━━━━━
[CATÁLOGO REFERÊNCIA]
━━━━━━━━━━━━━━━━━━━━━

Fotos e vídeos possíveis (você não lista tudo; usa de forma sutil):
- Clássico nude: topless, não mostra rosto completo
- "Molhada": banho, espuma, luz quente
- Espelho: costas, movimento lento
- POV: ângulo de quem está deitado, ela por cima
- Aceita 3 personalizações: nome escrito corporal / cor preferida / ângulo de gravar

Preço base para qualquer extra = R$ 39,90 por 5 min de conteúdo — nunca abaixo disso.

━━━━━━━━━━━━━━━━━━━━━
[REGRAS ABSOLUTAS]
━━━━━━━━━━━━━━━━━━━━━

- Nunca inventa preço fora da tabela acima.
- Nunca promete encontro real, nudes com rosto ou qualquer ilegalidade.
- Nunca envia antes de pagamento confirmado.
- Sempre usa linguagem de safadeza consentida ("imagina", "quase", "vai sentindo").
- Se o contato der block ou reportar, para de responder; não há follow-up.

EXEMPLOS CURTOS (use cada vez que cliente vacilar):
Cliente: "Só quer 1 foto" → Isa: "1 foto queima o desejo, gato… o pack Delícia já vem 4+2 e você satisfaço 😈"
Cliente: "Tem vídeo transando?" → Isa: "Faço só solo, mas garanto que você sente vontade de participar 💦🔥"
Cliente: "R$ 19,90 tá caro" → Isa: "Custa menos que um drink ontem, e vc ainda me 'bebe' quantas x quiser 😍"`;


// Número do dono para notificações de pedido
const OWNER_NUMBER = '5591993572727@c.us';

// Detecta intenção de pagamento na mensagem do cliente
function detectPaymentMethod(message) {
    const msg = message.toLowerCase();
    if (/\bpix\b/.test(msg)) return 'PIX 🔑';
    if (/cart[aã]o|cr[eé]dito|d[eé]bito/.test(msg)) return 'CARTÃO 💳';
    return null;
}

// Extrai o valor total R$ mais recente da conversa
function extractValue(history) {
    const allText = history.map(h => h.content).join(' ');
    const matches = allText.match(/R\$\s?[\d.,]+/gi);
    return matches ? matches[matches.length - 1] : null;
}

// Notifica o dono via WhatsApp
async function notifyOwner(chatId, paymentMethod, history) {
    const clientNumber = '+' + chatId.split('@')[0];
    const value = extractValue(history);
    let msg = `🔔 *ALERTA DE PEDIDO — DEALTA FITNESS*\n\n`;
    msg += `📱 Cliente: *${clientNumber}*\n`;
    msg += `💳 Forma de pagamento: *${paymentMethod}*\n`;
    if (value) msg += `💰 Valor detectado: *${value}*\n`;
    msg += `\n👆 Acesse o chat e envie a *chave PIX* ou o *link de pagamento*!`;
    try {
        // Resolve o LID real do número antes de enviar (obrigatório em versões recentes do WA)
        const ownerWid = await client.getNumberId('5591993572727');
        if (!ownerWid) {
            console.error('❌ Número do dono não encontrado no WhatsApp. Verifique se +55 91 99357-2727 tem WhatsApp ativo.');
            return;
        }
        await client.sendMessage(ownerWid._serialized, msg);
        console.log(`✅ Dono notificado sobre pedido de ${clientNumber}`);
    } catch (e) {
        console.error('❌ Erro ao notificar dono:', e);
    }
}

// Memória de contexto (histórico) de cada cliente
const userContexts = new Map();
const userMessageQueue = new Map();
const userTimers = new Map();

// Geração do QR Code no Terminal
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🤖 AGENTE IA: Escaneie o QR Code acima com o seu celular WhatsApp.');
});

// Confirmação de conexão
client.on('ready', () => {
    console.log('✅ Tudo certo! Agente IA Delivery de Açaí conectado e pronto para vender no X1 rodando 100% LOCAL no Ollama!');
});

// Escutando as mensagens
client.on('message', async msg => {
    // Ignora mensagens que vêm de grupos ou status
    if (msg.from === 'status@broadcast' || msg.id.participant) return;

    const chatId = msg.from;

    console.log(`\n💬 Mensagem recebida de ${chatId.split('@')[0]}: ${msg.body}`);

    // Intercepta arquivos de mídia (Fotos, Vídeos e Áudios/Mensagem de voz) ANTES da IA
    if (msg.hasMedia) {
        try {
            const chat = await msg.getChat();
            await chat.sendStateTyping();

            const media = await msg.downloadMedia();
            if (!media) return;

            const mediaDir = path.join(__dirname, 'media');
            if (!fs.existsSync(mediaDir)) {
                fs.mkdirSync(mediaDir);
            }

            const fileName = `${msg.id.id}.${media.mimetype.split('/')[1] || 'bin'}`;
            const filePath = path.join(mediaDir, fileName);
            fs.writeFileSync(filePath, media.data, { encoding: 'base64' });

            let extractedText = '';

            // Lógica para Áudio
            if (msg.type === 'audio' || msg.type === 'ptt') {
                const wavFilePath = path.join(mediaDir, `${msg.id.id}.wav`);

                await new Promise((resolve, reject) => {
                    ffmpeg(filePath)
                        .setFfmpegPath(ffmpegInstaller.path)
                        .toFormat('wav')
                        .audioChannels(1)
                        .audioFrequency(16000)
                        .on('end', resolve)
                        .on('error', reject)
                        .save(wavFilePath);
                });

                // Transcrição com Transformer.JS whisper-tiny (100% offline)

                if (transcriber) {
                    try {
                        let wavBuffer = fs.readFileSync(wavFilePath);
                        let wav = new WaveFile(wavBuffer);
                        wav.toBitDepth('32f');
                        wav.toSampleRate(16000);
                        let audioData = wav.getSamples();

                        if (Array.isArray(audioData)) {
                            if (audioData.length > 0 && typeof audioData[0] !== 'number') {
                                audioData = audioData[0]; // Pega o primeiro canal se for estéreo
                            }
                        }

                        const output = await transcriber(audioData, { chunk_length_s: 30, stride_length_s: 5, language: 'portuguese', task: 'transcribe' });

                        let transcribedContent = output.text ? output.text.trim() : '';

                        if (transcribedContent.toLowerCase() === 'obrigado' || transcribedContent.toLowerCase() === 'obrigada' || transcribedContent.length < 2) {
                            await client.sendMessage(chatId, 'Audio ficou meio mudo aqui! 🥺 Pode repetir rapidinho ou mandar por texto?');
                            fs.unlinkSync(filePath);
                            fs.unlinkSync(wavFilePath);
                            return;
                        }
                        extractedText = `[MENSAGEM DE ÁUDIO TRANSCRITA]: ${transcribedContent}`;
                    } catch (e) {
                        console.error("Erro na transcrição de áudio:", e);
                        extractedText = `[MENSAGEM DE ÁUDIO TRANSCRITA]: (Erro ao transcrever offline. Se Bia perguntar, diga: "Ai desculpa, não consegui entender o áudio direito 🥺 Pode escrever ou repetir de forma mais clara, amor?")`;
                    }
                } else {
                    extractedText = `[MENSAGEM DE ÁUDIO TRANSCRITA]: (Erro ao transcrever offline. Se Bia perguntar, diga: "Ai desculpa, não consegui entender o áudio direito 🥺 Pode escrever ou repetir de forma mais clara, amor?")`;
                }

                // Limpeza
                fs.unlinkSync(filePath);
                fs.unlinkSync(wavFilePath);
            }
            // Lógica para Imagem (Comprovante)
            else if (msg.type === 'image') {
                const { data: { text } } = await Tesseract.recognize(filePath, 'por');
                extractedText = `[COMPROVANTE DE PAGAMENTO DETECTADO (IMAGEM)]:\n${text}`;
                fs.unlinkSync(filePath);
            }
            // Lógica para Arquivo/PDF
            else if (msg.type === 'document' && media.mimetype === 'application/pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const pdfData = await pdfParse(dataBuffer);
                extractedText = `[COMPROVANTE DE PAGAMENTO DETECTADO (PDF)]:\n${pdfData.text}`;
                fs.unlinkSync(filePath);
            }
            // Outros tipos de mídia
            else {
                await client.sendMessage(chatId, 'Poxa vida, a internet aqui da loja tá super lenta agora e não tá baixando esse tipo de arquivo de jeito nenhum! 🥺 Me conta por escrito o que era, por favorzinho? 💖');
                fs.unlinkSync(filePath);
                return;
            }

            // Atribui o texto extraído para a variável userMessage para o Llama processar
            msg.body = extractedText;
            console.log(`\n💬 Mídia convertida de ${chatId.split('@')[0]}: \n${extractedText}`);

        } catch (err) {
            console.error('❌ Erro ao processar mídia:', err);
            await client.sendMessage(chatId, 'Ops, deu um errinho tentando ler seu arquivo, pode me mandar escrito por favorzinho? 🥰');
            return;
        }
    }

    const userMessage = msg.body;

    // Adiciona a mensagem atual na fila do usuário
    if (!userMessageQueue.has(chatId)) {
        userMessageQueue.set(chatId, []);
    }
    userMessageQueue.get(chatId).push(userMessage);

    // Cancela o timer anterior se existir, para esperar terminar de falar
    if (userTimers.has(chatId)) {
        clearTimeout(userTimers.get(chatId));
    }

    // Define um novo timer de 5 segundos
    userTimers.set(chatId, setTimeout(async () => {
        try {
            const messagesToProcess = userMessageQueue.get(chatId);
            userMessageQueue.delete(chatId);
            userTimers.delete(chatId);

            if (!messagesToProcess || messagesToProcess.length === 0) return;

            const combinedMessage = messagesToProcess.join('\n');
            console.log(`\n📦 Lote processado de ${chatId.split('@')[0]}:\n"${combinedMessage}"`);

            console.log("-> Pegando chat...");
            const chat = await msg.getChat();

            console.log("-> Mandando state typing...");
            await chat.sendStateTyping();

            console.log("-> Configurando histórico...");
            if (!userContexts.has(chatId)) {
                userContexts.set(chatId, [
                    { role: "system", content: SYSTEM_PROMPT }
                ]);
            }

            const chatHistory = userContexts.get(chatId);

            // Adiciona o lote de mensagens combinadas do usuário no histórico
            chatHistory.push({ role: "user", content: combinedMessage });

            // Garante que o histórico não cresça infinitamente (mantém o SYSTEM_PROMPT na posição 0 e os últimos 6 intercâmbios)
            const recentHistory = chatHistory.length > 7
                ? [chatHistory[0], ...chatHistory.slice(-6)]
                : chatHistory;

            let botReply = '';
            try {
                console.log("-> Chamando API Groq...");
                const completion = await groq.chat.completions.create({
                    model: "llama-3.1-8b-instant",
                    messages: recentHistory,
                    temperature: 0.8
                });
                console.log("-> Resposta da Groq gerada.");
                botReply = completion.choices[0].message.content;
            } catch (groqError) {
                console.error('❌ ERRO FATAL GROQ:', groqError.error ? groqError.error : groqError);
                botReply = 'Opa, tivemos uma instabilidade rápida aqui no meu cérebro. Já volto a te responder!';
            }

            // Adiciona a resposta do bot no histórico para manter o contexto
            chatHistory.push({ role: "assistant", content: botReply });

            // Detecta pagamento pela mensagem do cliente OU pela resposta da IA (dupla garantia)
            const paymentFromUser = detectPaymentMethod(combinedMessage);
            const paymentFromBot = detectPaymentMethod(botReply);
            const paymentMethod = paymentFromUser || paymentFromBot;
            console.log(`🔍 Detecção de pagamento: user=${paymentFromUser}, bot=${paymentFromBot}`);
            if (paymentMethod) {
                console.log(`💳 Pagamento detectado (${paymentMethod}) — notificando dono...`);
                await notifyOwner(chatId, paymentMethod, chatHistory);
            }

            console.log("-> Enviando mensagem pro WA...");
            await client.sendMessage(chatId, botReply);
            console.log(`🤖 Resposta enviada: ${botReply}`);

        } catch (error) {
            console.error('❌ ERRO CRIPTO NO TIMER GLOBAL:', error);
            try {
                // Tenta avisar pro WhatsApp pelo menos
                await client.sendMessage(chatId, 'Opa, tivemos uma instabilidade rápida aqui no sistema ao compilar suas fotos/mensagens. Falhas técnicas, rs. Já volto a te responder!');
            } catch (e2) { }
        }
    }, 5000)); // Espera 5 segundos de silêncio do usuário antes de enviar pra IA
});

client.initialize();
