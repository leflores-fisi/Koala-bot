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

  constructor(config) {
    this.config = config
  }

  setup(voiceConnection, channel) {
    this.connection = voiceConnection
    this.connection.subscribe(this.audioPlay)
    this.channel = channel

    this.audioPlay.on(AudioPlayerStatus.Idle, (before) => {
      console.log('AudioPlayerStatus: Idle')

      if (before === AudioPlayerStatus.Playing) {
        console.log('no more songs to play!')

        if (!player.empty()) {
          inter.channel.send('no songs left on the queue!')
        }
        const lastSong = player.pop()
        fs.unlink(`${lastSong.id}.${config.audioFormat}`, (err) => {
          if (!err) console.log(`deleted, i hope...`)
          else console.error(err)
        })
      }
      else {
        player.play()
      }
    })

    this.audioPlay.on(AudioPlayerStatus.Playing, () => {
      console.log(`a song started playing, next ${player.lastSong().name}`)
    })
  }

  addSong(songData) {
    this.queue.push(songData)
    if (this.audioPlay.state.status == AudioPlayerStatus.Idle) {
    }
  }
  empty() {
    return this.queue.length > 0
  }
  lastSong() {
    return this.queue.at(-1)
  }
  pop() {
    return this.queue.pop()
  }
  pause() {
    this.audioPlay.pause()
  }
  resume() {
    this.audioPlay.unpause()
  }
  sendEmbedForCurrentSong(channel = null) {
    if (!channel) channel = this.channel
    if (this.empty()) return
    channel.send({
      embeds: [{
        color: 0x0099ff,
        title: 'Current song',
        description: this.lastSong().name,
        thumbnail:{
          url: this.lastSong().thumbnail
        },
      }],
    })
  }
  destroy() {
    this.stop()
    this.connection.destroy()
    this.queue = []
  }
  stop() {
    this.audioPlay.stop()
  }
  skip() {
    this.audioPlay.stop()
  }
  play() {
    let songData = this.lastSong()

    try {
      const res = createAudioResource(createReadStream(`${songData.id}.${audioFormat}`))
      this.audioPlay.play(res)
      this.audioPlay.on('error', (error) => {
        console.err(`error on audio play ${error}`)
      })
      player.sendEmbedForCurrentSong(this.channel)
    } catch(error) {
      console.error("Could not create audio resource: ", error)
    }
  }
}

//-------global---variables----------------
const config = {
  audioFormat: 'opus'
}
const player = new MusicPlayer(config)

//-----------------------------------------

audioPlay.on("error", (console.error))

// When the client is ready, run this code (only once)
client.once('ready', () => {
  console.log('Ready!')
})

console.log(process.env.TOKEN)

// Login to Discord with your client's token
client.login(process.env.TOKEN)

client.on('voiceStateUpdate', (oldState, newState) => {
  // TODO: we may react better to vc channel change/leave
  player.destroy()
})

client.on('interactionCreate', async (inter) => {
  if (!inter.isCommand) return

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

  if (inter.commandName == 'leave') {
    await inter.reply('leaving...')
    player.destroy()
  }

  if (inter.commandName == 'current') {
    if (player.empty()) {
      inter.reply('no song playing!!')
      return
    }
    player.sendEmbedForCurrentSong(inter.channel)
  }

  if (inter.commandName == 'do' && inter.member.voice.channel) {
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
      player.setup(voiceConnection)
    } catch (connectionError) {
      console.error("connection could not be succesfully created")
      return
    }

    metadataStream.stdout.on('data', (data) => {
      metadata += data
    })

    metadataStream.stdout.on('end', () => {
      const meta = JSON.parse(metadata.toString())
      const songData = {
        id: meta.id,
        name: meta.title,
        thumbnail: meta.thumbnail
      }

      const download = spawn('yt-dlp', ['-x', '-o', '%(id)s', inter.options.getString('url')])
      download.on('error', console.error)
      download.on('close', async () => {
        await inter.reply(`${songData.name} añadido a la cola! :V`)
        player.addSong(songData)
      })
    })
  }

  if (inter.commandName == 'skip') {
    await inter.reply('skipping...')
    player.stop()
  }

  if (inter.commandName == 'resume') {
    player.resume()
  }

  if (inter.commandName == 'pause') {
    player.pause()
  }
})
