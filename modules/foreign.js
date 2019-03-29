const { promisify } = require('util')
const redis = require('redis')
const uuidv4 = require('uuid/v4')
const appendQuery = require('append-query')
const config = require('@femto-apps/config')
const normUrl = require('normalize-url')

const Token = require('../models/Token')
const services = require('../consumers/getConsumer')

const client = redis.createClient()
const setAsync = promisify(client.set).bind(client)

client.on('error', err => {
    console.log(`Received error: ${err}`)
    process.exit(1)
})

// contains 'id', 'redirect'
exports.getAuth = async function(req, res) {
    const { id, redirect } = req.query

    let consumer = await services.getConsumer(id)
    console.log(consumer)
    if (!(consumer)) {
        return res.json({ err: 'Invalid ID' })
    }

    let redirects = services.getRedirects(consumer)
    let url
    try {
        url = new URL(redirect)
    } catch(e) {
        return res.json({ err: 'Cannot Parse Redirect URL' })
    }
    
    let origUrl = normUrl(url.origin)
    if (redirects.indexOf(origUrl) == -1) {
        return res.json({ err: 'Unacceptable Redirect' })
    }

    // generate a new token.
    const tokenId = uuidv4()
    
    const token = new Token({
        token: tokenId,
        user: req.user._id
    })

    if ('tokens' in req.session) {
        req.session.tokens.push({ token: tokenId, user: req.user._id})
    } else {
        req.session.tokens = [{ token: tokenId, user: req.user._id }]
    }

    await token.save()

    await setAsync(`${config.get('redis.session')}:${tokenId}`, JSON.stringify({ users: [req.user] }))

    return res.redirect(appendQuery(redirect, 'token=' + encodeURIComponent(tokenId)))
}

exports.getVerify = async function(req, res) {
    const tokenId = req.query.token

    const token = await Token.findOne({ token: tokenId }).populate('user')

    if (!token) {
        return res.json({
            err: 'Unknown Token'
        })
    }

    return res.json(token.user)
}
