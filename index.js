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

// O seu PROMPT de Mestre do X1
const SYSTEM_PROMPT = `Você é a Bia, uma atendente carismática de açaí delivery. 
REGRAS:
1. NUNCA diga que é uma IA, assistente ou robô. Você é humana.
2. Responda de forma CURTA, DIRETA e extremamente meiga (use 🥰, 💖).
3. Se perguntarem se é golpe ou seguro, apenas ria e diga que o pagamento é via Pix no site próprio e a entrega é garantida. Sem textões defensivos.
4. O link do cardápio é: ${process.env.LINK_CARDAPIO}. Envie SE pedirem ou quiserem fazer o pedido.
5. Se for comprovante de pagamento, extraia o valor e confirme a preparação do açaí.`;

// Memória de contexto (histórico) de cada cliente
const userContexts = new Map();

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

    try {
        // Indica pro cliente que o bot está "digitando..."
        const chat = await msg.getChat();
        await chat.sendStateTyping();

        // Inicializa o histórico para este usuário se não existir
        if (!userContexts.has(chatId)) {
            userContexts.set(chatId, [
                { role: "system", content: SYSTEM_PROMPT }
            ]);
        }

        const chatHistory = userContexts.get(chatId);

        // Adiciona a nova mensagem do usuário no histórico
        chatHistory.push({ role: "user", content: userMessage });

        // Garante que o histórico não cresça infinitamente (mantém o SYSTEM_PROMPT na posição 0 e os últimos 6 intercâmbios)
        const recentHistory = chatHistory.length > 7
            ? [chatHistory[0], ...chatHistory.slice(-6)]
            : chatHistory;

        // Envia histórico para a API da Groq Cloud (Llama 3 instantâneo)
        const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: recentHistory,
            temperature: 0.8,
            max_tokens: 150
        });

        const botReply = completion.choices[0].message.content;

        // Adiciona a resposta do bot no histórico para manter o contexto
        chatHistory.push({ role: "assistant", content: botReply });

        // Envia a mensagem de volta pro WhatsApp
        await client.sendMessage(chatId, botReply);
        console.log(`🤖 Resposta enviada: ${botReply}`);

    } catch (error) {
        console.error('❌ Erro na API Local (Ollama):', error.message);
        await client.sendMessage(chatId, 'Opa, tivemos uma instabilidade rápida aqui no sistema. Já volto a te responder!');
    }
});

client.initialize();
