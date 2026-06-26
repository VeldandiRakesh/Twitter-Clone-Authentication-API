const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDatabaseAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    const PORT = process.env.PORT || 3000

    app.listen(PORT, () => {
      console.log(`Server Running at http://localhost:${PORT}/`)
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDatabaseAndServer()

// API FOR CHECKING USERS
app.get('/users/', async (request, response) => {
  const users = await db.all('SELECT * FROM user;')
  response.send(users)
})

// JWT AUTHENTICATION MIDDLEWARE
const authenticateToken = (request, response, next) => {
  let jwtToken

  const authHeader = request.headers['authorization']

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'rakeshveldandi', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// API 1 - REGISTER
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const checkUserQuery = `
    SELECT *
    FROM user
    WHERE username='${username}';
  `

  const dbUser = await db.get(checkUserQuery)

  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)

    const createUserQuery = `
      INSERT INTO user
      (username,password,name,gender)
      VALUES(
        '${username}',
        '${hashedPassword}',
        '${name}',
        '${gender}'
      );
    `

    await db.run(createUserQuery)

    response.send('User created successfully')
  }
})

// API 2 - LOGIN
app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const getUserQuery = `
    SELECT *
    FROM user
    WHERE username='${username}';
  `

  const dbUser = await db.get(getUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)

    if (isPasswordMatched) {
      const payload = {
        username: username,
      }

      const jwtToken = jwt.sign(payload, 'rakeshveldandi')

      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// API 3 - USER TWEETS FEED
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request

  const getFeedQuery = `
      SELECT
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime
      FROM follower
      INNER JOIN tweet
        ON follower.following_user_id = tweet.user_id
      INNER JOIN user
        ON user.user_id = tweet.user_id
      WHERE follower.follower_user_id = (
        SELECT user_id
        FROM user
        WHERE username='${username}'
      )
      ORDER BY tweet.date_time DESC
      LIMIT 4;
    `

  const feed = await db.all(getFeedQuery)

  response.send(feed)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request

  const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

  const user = await db.get(getUserQuery)

  const userListQuery = `
    SELECT
      user.name
    FROM follower
    INNER JOIN user
      ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${user.user_id};
  `

  const followingList = await db.all(userListQuery)

  response.send(followingList)
})
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request

  const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

  const user = await db.get(getUserQuery)

  const getFollowersQuery = `
    SELECT
      user.name
    FROM follower
    INNER JOIN user
      ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${user.user_id};
  `

  const followersList = await db.all(getFollowersQuery)

  response.send(followersList)
})

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request

  const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

  const user = await db.get(getUserQuery)

  const checkTweetQuery = `
    SELECT tweet.tweet_id
    FROM tweet
    INNER JOIN follower
      ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user.user_id}
      AND tweet.tweet_id = ${tweetId};
  `

  const tweetAccess = await db.get(checkTweetQuery)

  if (tweetAccess === undefined) {
    response.status(401)
    response.send('Invalid Request')
    return
  }

  const getTweetDetailsQuery = `
    SELECT
      tweet.tweet AS tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet
    LEFT JOIN like
      ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply
      ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId};
  `

  const tweetDetails = await db.get(getTweetDetailsQuery)

  response.send(tweetDetails)
})

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

    const user = await db.get(getUserQuery)

    const checkTweetQuery = `
    SELECT tweet.tweet_id
    FROM tweet
    INNER JOIN follower
      ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user.user_id}
      AND tweet.tweet_id = ${tweetId};
  `

    const tweetAccess = await db.get(checkTweetQuery)

    if (tweetAccess === undefined) {
      response.status(401)
      response.send('Invalid Request')
      return
    }

    const getLikesQuery = `
    SELECT user.username
    FROM like
    INNER JOIN user
      ON like.user_id = user.user_id
    WHERE like.tweet_id = ${tweetId};
  `

    const likesArray = await db.all(getLikesQuery)

    response.send({
      likes: likesArray.map(each => each.username),
    })
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

    const user = await db.get(getUserQuery)

    const checkTweetQuery = `
    SELECT tweet.tweet_id
    FROM tweet
    INNER JOIN follower
      ON tweet.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user.user_id}
      AND tweet.tweet_id = ${tweetId};
  `

    const tweetAccess = await db.get(checkTweetQuery)

    if (tweetAccess === undefined) {
      response.status(401)
      response.send('Invalid Request')
      return
    }

    const getRepliesQuery = `
    SELECT
      user.name,
      reply.reply
    FROM reply
    INNER JOIN user
      ON reply.user_id = user.user_id
    WHERE reply.tweet_id = ${tweetId};
  `

    const repliesArray = await db.all(getRepliesQuery)

    response.send({
      replies: repliesArray,
    })
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request

  const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

  const user = await db.get(getUserQuery)

  const getTweetsQuery = `
    SELECT
      tweet.tweet AS tweet,
      COUNT(DISTINCT like.like_id) AS likes,
      COUNT(DISTINCT reply.reply_id) AS replies,
      tweet.date_time AS dateTime
    FROM tweet
    LEFT JOIN like
      ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply
      ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ${user.user_id}
    GROUP BY tweet.tweet_id;
  `

  const tweets = await db.all(getTweetsQuery)

  response.send(tweets)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {username} = request
  const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

  const user = await db.get(getUserQuery)
  const createTweetQuery = `
    INSERT INTO tweet (tweet, user_id)
    VALUES (
      '${tweet}',
      ${user.user_id}
    );
  `

  await db.run(createTweetQuery)

  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request

    const getUserQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}';
  `

    const user = await db.get(getUserQuery)

    const checkTweetQuery = `
    SELECT *
    FROM tweet
    WHERE tweet_id = ${tweetId}
      AND user_id = ${user.user_id};
  `

    const tweet = await db.get(checkTweetQuery)

    if (tweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
      return
    }

    const deleteTweetQuery = `
    DELETE FROM tweet
    WHERE tweet_id = ${tweetId};
  `

    await db.run(deleteTweetQuery)

    response.send('Tweet Removed')
  },
)
module.exports = app
