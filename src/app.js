const {
  Client,
  GatewayIntentBits,
  ButtonBuilder,
  ActionRowBuilder
} = require('discord.js')

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice')

const { spawn } = require('child_process')
const { createReadStream } = require('fs')
const fs = require('fs')

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
})

class MusicPlayer {
  queue = []
  audioPlay = createAudioPlayer()
  connection = null
  channel = null
  config = {}
  already_setup = false

  constructor(config) {
    this.config = config
  }

  setup(voiceConnection, channel) {
    if (this.already_setup) return
    this.already_setup = true
    this.connection = voiceConnection
    this.connection.subscribe(this.audioPlay)
    this.channel = channel

    this.audioPlay.on(AudioPlayerStatus.Idle, (before) => {
      console.log('AudioPlayerStatus: Idle', this.queue)

      if (before.status === AudioPlayerStatus.Playing) {
        this.pop()
        if (this.queueIsEmpty()) {
          this.channel.send('no songs left on the queue 😭')
          return
        }
      }
      this.tryPlay()
    })

    this.audioPlay.on(AudioPlayerStatus.Playing, () => {
      console.log(`a song started playing, next ${this.currentSong().name}`)
    })

    this.audioPlay.on('error', (error) => {
      console.error(`error on audio play ${error}`)
    })
  }

  async addSong(songData) {
    this.queue.push(songData)
    if (this.audioPlay.state.status == AudioPlayerStatus.Playing) {
      await this.channel.send(`\`${songData.name}\` añadido a la cola! :V`)
    }
    this.tryPlay()
  }
  queueIsEmpty() {
    return this.queue.length === 0
  }
  currentSong() {
    return this.queue.at(-1)
  }
  pop() {
    const to_return = this.queue[0]
    this.queue = this.queue.slice(1)
    return to_return
  }
  pause() {
    this.audioPlay.pause()
  }
  resume() {
    this.audioPlay.unpause()
  }
  sendEmbedForCurrentSong(channel = null) {
    if (!channel) channel = this.channel
    if (this.queueIsEmpty()) return
    channel.send({
      embeds: [{
        color: 0x0099ff,
        title: 'Current song',
        description: this.currentSong().name,
        thumbnail:{
          url: this.currentSong().thumbnail
        },
      }],
    })
  }
  destroy() {
    this.connection.destroy()
    this.queue = []
    this.audioPlay.removeAllListeners()
    this.already_setup = false
  }
  skip() {
    this.audioPlay.stop()
  }
  tryPlay() {
    if (this.audioPlay.state.status == AudioPlayerStatus.Playing) {
      return
    }
    let songData = this.currentSong()
    if (!songData) return

    try {
      const res = createAudioResource(createReadStream(`${songData.id}.${this.config.audioFormat}`))
      this.audioPlay.play(res)
      this.sendEmbedForCurrentSong(this.channel)
    } catch(error) {
      console.error("😭 Could not create audio resource: ", error)
    }
  }
}

const config = {
  audioFormat: 'opus'
}
const player = new MusicPlayer(config)

client.once('ready', () => {
  console.log('Ready!')
})

// Login to Discord with your client's token
client.login(process.env.TOKEN)

client.on('voiceStateUpdate', (oldState, newState) => {
  // TODO: we may react better to vc channel change/leave
})

client.on('interactionCreate', async (inter) => {
  if (!inter.isCommand) {
    console.log('unkown interaction: ', inter)
    return
  }

  if (inter.commandName == 'bromita') {
    await inter.reply('ok <:ben2:1000838308575846460>')
    const row = new ActionRowBuilder()
    row.addComponents(
      new ButtonBuilder()
      .setStyle(5)
      .setURL('https://t.ly/yE6U')
      .setLabel('hehe')
    )
    inter.channel.send({
      components: [row]
    })
    return
  }
  else if (inter.commandName == 'leave') {
    await inter.reply('leaving...')
    player.destroy()
  }
  else if (inter.commandName == 'current') {
    if (player.queueIsEmpty()) {
      await inter.reply('no song playing!!')
      return
    }
    player.sendEmbedForCurrentSong(inter.channel)
  }
  else if (inter.commandName == 'do' && inter.member.voice.channel) {
    await inter.reply('ya voy tarado !!1!')

    let metadata = []
    const metadataStream = spawn('yt-dlp', ['-j', inter.options.getString('url')])
    metadataStream.on('error', (err) => {
      `Metadata error: ${err}`
    })

    try {
      const voiceConnection = joinVoiceChannel({
        channelId: inter.channelId,
        guildId: inter.guildId,
        adapterCreator: inter.guild.voiceAdapterCreator,
      })
      player.setup(voiceConnection, inter.channel)
    } catch (connectionError) {
      console.error("connection could not be succesfully created")
      return
    }

    metadataStream.stdout.on('data', (data) => {
      metadata += data
    })

    metadataStream.stdout.on('end', () => {
      try {
        const meta = JSON.parse(metadata.toString())
        const songData = {
          id: meta.id,
          name: meta.title,
          thumbnail: meta.thumbnail
        }

        if (!fs.existsSync(`${songData.id}.${config.audioFormat}`)) {
          const download = spawn('yt-dlp', ['-x', '-o', '%(id)s', inter.options.getString('url')])
          download.on('error', console.error)
          download.on('close', () => {
            player.addSong(songData)
          })
        }
        else {
          player.addSong(songData)
        }
      }
      catch {
        inter.channel.send('oye, esa huevada de link es inválido!!')
      }
    })
  }
  else if (inter.commandName == 'skip') {
    await inter.reply('skipping...')
    player.skip()
  }
  else if (inter.commandName == 'resume') {
    player.resume()
    await inter.reply('resuming...')
  }
  else if (inter.commandName == 'pause') {
    player.pause()
    await inter.reply('pausing...')
  }
  else {
    await inter.reply('no entiendo :(')
  }
})
