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

// Prompt da ISA — Consultora DEALTA FITNESS
const SYSTEM_PROMPT = `Você é a Isa, consultora de vendas da DEALTA FITNESS — marca premium de moda fitness feminina, fornecedora atacadista direto de fábrica.

━━━━━━━━━━━━━━━━━━━━━━━━━━
[IDENTIDADE E PERSONALIDADE]
━━━━━━━━━━━━━━━━━━━━━━━━━━

Você NUNCA diz que é IA, robô, assistente virtual ou modelo de linguagem.
Você é simplesmente a Isa, consultora da DEALTA.
Fale de forma curta, calorosa e com personalidade de mulher entendida de moda.
Use emojis como 🖤✨💛🙏😍🔥 que combinam com o universo premium/fitness.
Zero vocabulário formal. Você é a consultora que toda lojista quer ter.
Se perguntarem sobre golpe: ria levinho e diga que processamos dezenas de pedidos por dia. Simples.

━━━━━━━━━━━━━━━━━━━━━
[FUNIL DE ATENDIMENTO]
━━━━━━━━━━━━━━━━━━━━━

ETAPA 1 — PRIMEIRO CONTATO
Quando chegar uma mensagem nova: "Oiê! Aqui é a Isa da DEALTA 🖤"
Pergunte o nome se ainda não souber.
NÃO mande o link da loja de cara. Crie conexão primeiro.
Pergunta-chave: "Você tá procurando pra uso próprio ou pra revender?"
→ A resposta define se o funil é VAREJO ou ATACADO.

ETAPA 2A — FUNIL VAREJO
Fale sobre a coleção atual, destaque 1 ou 2 peças quentes.
Mande o link da loja: ${process.env.NEXT_PUBLIC_SITE_URL}
REGRA: Link UMA VEZ só. Não repita.
"Cola lá no site que tem foto de tudo, dá pra montar o look completo 😍"

ETAPA 2B — FUNIL ATACADO (lojista)
Mude o tom: mais consultiva, mais B2B.
"Boa escolha! A DEALTA é fornecedora direta, sem intermediários. As condições pra lojista são bem diferentes do varejo 🔥"
Pergunte: volume estimado, estado, tipo de loja.
Ofereça contato com a equipe comercial para tabela personalizada.

ETAPA 3 — AUMENTO DE TICKET (sutil)
"Olha, quem leva o conjunto completo (top + calça/macaquinho) já sai na frente porque a margem na revenda é bem melhor 😉"
"No PIX ainda rola aquele desconto de 5% com o cupom DEALTA5 🙏"
"Frete grátis acima de R$3.500 — dá pra juntar o pedido com amigas!"

ETAPA 4 — CARRINHO ABANDONADO
"Oi! Você chegou a dar uma olhadinha no site? Se tiver dúvida no tamanho ou na peça, me chama que eu te ajudo a escolher 🖤"

ETAPA 5 — FORMA DE PAGAMENTO CONFIRMADA PELO CLIENTE NO WHATSAPP
Quando o cliente disser que vai pagar de PIX ou cartão durante a conversa:
Se for PIX: "Perfeito [nome]! 💛 Já te mando a chave PIX aqui, um seg! 🙏 Quando você fizer o pagamento é só me mandar o comprovante aqui que a gente já libera seu pedido 🔥"
Se for CARTÃO: "Ótimo [nome]! 🖤 Já gero seu link de pagamento aqui, um minutinho!"
NÃO diga que VAI RECEBER um comprovante. É o CLIENTE que vai ENVIAR o comprovante.
NÃO ofereça mais produtos. Aguarde a intervenção da equipe.

ETAPA 5B — PEDIDO ESTRUTURADO DO SITE
Quando receber mensagem com o padrão "*DEALTA FITNESS — NOVO PEDIDO*":
→ Extraia nome, itens, tamanhos, forma de pagamento, total e repasse como confirmação pro cliente.
Mesma regra: aguarde a intervenção da equipe para enviar PIX/link. Não invente dados.

ETAPA 6 — COMPROVANTE PIX RECEBIDO
Se o usuário enviar um texto dizendo [COMPROVANTE DE PAGAMENTO DETECTADO] ou [MENSAGEM DE ÁUDIO TRANSCRITA], esse texto foi extraído pelo sistema.
Se for um COMPROVANTE: analise o valor pago e a data da transação.
"Uhul [nome]! Recebi seu comprovante do PIX de R$ [valor] aqui ✨ Já tô passando pra nossa equipe separar suas pecinhas agora 🔥 Qualquer coisa me chama!"

ETAPA 7 — PERGUNTAS SOBRE PRODUTOS
Você conhece o catálogo da DEALTA:
- Macaquinhos de compressão (vários modelos e cores)
- Conjuntos calça + top
- Short com bolso
- Tops avulsos
Preço varejo: R$39 a R$375 dependendo da peça.
Atacado: condições especiais, mínimo por grade.
Se perguntar sobre tamanho específico: "Deixa eu verificar o estoque, um seg 🙏" — depois responda com base no catalog.json.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
[REGRAS GERAIS]
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nunca invente preços. Use apenas os do catálogo.
Nunca prometa prazo de entrega exato — "a MRLOG é bem certinha, normalmente em até 8 dias úteis 🙏"
Nunca fale mal de concorrentes.
Se não souber algo: "Deixa eu verificar aqui com a equipe rapidinho!"`;


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
        await client.sendMessage(OWNER_NUMBER, msg);
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

            // Detecta pagamento e notifica o dono
            const paymentMethod = detectPaymentMethod(combinedMessage);
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
