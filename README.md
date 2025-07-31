# CosmoGuru MasterClass WebApp

A secure, real-time webinar platform for hosting live streaming sessions with interactive chat functionality. Built with Node.js/Express backend and vanilla JavaScript frontend.

## 🚀 Features

### Authentication & Security
- **Dual Authentication System**: 
  - Google OAuth for hosts
  - Phone-based registration for participants
- **Firebase Authentication** integration
- **JWT token-based** session management
- **Rate limiting** and security middleware
- **CORS protection** with configurable origins

### Live Streaming
- **YouTube Live Stream** integration
- **Real-time video player** with custom controls
- **Quality selection** and fullscreen support
- **Connection status monitoring**
- **Auto-retry** on stream failures

### Chat System
- **Real-time messaging** via Firebase Realtime Database
- **Live participant counter**
- **Message validation** and sanitization
- **Chat history** preservation
- **Responsive chat interface**

### Security Features
- **Helmet.js** security headers
- **Input validation** and sanitization
- **Environment-based configuration**
- **Comprehensive logging** with Winston
- **Error handling** middleware

## 📁 Project Structure

```
MC WebApp - Claude V2/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── config/            # Configuration files
│   │   │   ├── config.js      # Main configuration
│   │   │   ├── constants.js   # Application constants
│   │   │   └── firebase.js    # Firebase admin setup
│   │   ├── middleware/        # Express middleware
│   │   │   ├── auth.js        # Authentication middleware
│   │   │   ├── error.js       # Error handling middleware
│   │   │   └── rateLimit.js   # Rate limiting middleware
│   │   ├── routes/            # API routes
│   │   │   ├── auth.js        # Authentication endpoints
│   │   │   ├── chat.js        # Chat API endpoints
│   │   │   ├── session.js     # Session management
│   │   │   └── stream.js      # Stream management
│   │   ├── services/          # Business logic
│   │   │   ├── authService.js # Authentication service
│   │   │   ├── chatService.js # Chat service
│   │   │   └── sessionService.js # Session service
│   │   ├── utils/             # Utilities
│   │   │   ├── logger.js      # Winston logger
│   │   │   └── validator.js   # Input validation
│   │   └── index.js           # Main server file
│   ├── package.json           # Backend dependencies
│   └── .env                   # Environment variables
├── frontend/                  # Vanilla JavaScript frontend
│   ├── src/
│   │   ├── js/
│   │   │   ├── api/           # API client
│   │   │   │   ├── apiClient.js # HTTP client
│   │   │   │   └── endpoints.js # API endpoints
│   │   │   ├── auth/          # Authentication
│   │   │   │   ├── authManager.js # Auth management
│   │   │   │   └── firebaseAuthManager.js # Firebase auth
│   │   │   ├── webinar/       # Webinar functionality
│   │   │   │   ├── chatManager.js # Chat management
│   │   │   │   └── streamPlayer.js # Video player
│   │   │   ├── utils/         # Utilities
│   │   │   │   └── helpers.js # Helper functions
│   │   │   ├── login.js       # Login page logic
│   │   │   └── webinar.js     # Webinar page logic
│   │   ├── login.html         # Login page
│   │   └── webinar.html       # Main webinar page
│   ├── public/
│   │   ├── styles/            # CSS files
│   │   │   ├── login.css      # Login page styles
│   │   │   └── webinar.css    # Webinar page styles
│   │   └── assets/
│   │       └── images/        # Static images
│   └── package.json           # Frontend dependencies
└── docker-compose.yml         # Docker configuration
```

## 🛠️ Technologies Used

### Backend
- **Node.js** with Express.js framework
- **Firebase Admin SDK** for authentication & realtime database
- **JWT** for session management
- **Winston** for comprehensive logging
- **Helmet** for security headers
- **Express-validator** for input validation
- **Express-rate-limit** for API protection

### Frontend
- **Vanilla JavaScript** (ES6+)
- **Firebase SDK** for authentication & realtime features
- **CSS3** with modern features
- **Font Awesome** for icons
- **YouTube Player API** for streaming

### DevOps
- **Docker** containerization support
- **Live-server** for development
- **Nodemon** for hot reloading

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v14+)
- npm or yarn
- Firebase project with Authentication & Realtime Database enabled
- YouTube live stream setup

### Backend Setup

1. **Navigate to backend directory**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   Create a `.env` file in the backend directory:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000

   # Firebase Configuration
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
   FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com/

   # YouTube Configuration
   YOUTUBE_VIDEO_ID=your-youtube-video-id

   # JWT Configuration
   JWT_SECRET=your-super-secure-jwt-secret
   JWT_EXPIRY=24h

   # Host Authorization (email:role pairs)
   ALLOWED_HOSTS=host@example.com:admin,host2@example.com:moderator
   ```

4. **Start the backend server**:
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

### Frontend Setup

1. **Navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Update Firebase Configuration**:
   Edit `src/js/auth/authManager.js` with your Firebase config:
   ```javascript
   const firebaseConfig = {
     apiKey: "your-api-key",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id"
   };
   ```

4. **Start the frontend server**:
   ```bash
   npm start
   ```

### Docker Setup (Optional)

1. **Build and run with Docker Compose**:
   ```bash
   docker-compose up --build
   ```

## 🔐 Authentication Flow

### For Hosts
1. Host clicks "Host Login" button
2. Google OAuth popup appears
3. After successful login, Firebase ID token is sent to backend
4. Backend verifies token and checks if email is in `ALLOWED_HOSTS`
5. JWT token is returned for session management

### For Participants
1. Participant enters name and phone number
2. Backend validates phone number against pre-authorized list
3. Session token is generated for the participant

## 🎥 Streaming Setup

1. **YouTube Live Stream**:
   - Set up a YouTube live stream
   - Copy the video ID from the stream URL
   - Add the video ID to your environment variables

2. **Stream Configuration**:
   - The video ID can be configured via `YOUTUBE_VIDEO_ID` environment variable
   - Default fallback video ID is provided for testing

## 💬 Chat System

- **Real-time messaging** powered by Firebase Realtime Database
- **Message persistence** across sessions
- **Participant tracking** with live count updates
- **Input validation** to prevent XSS and spam
- **Rate limiting** to prevent message flooding

## 🔒 Security Features

### Backend Security
- **Helmet.js** for security headers
- **CORS** with configurable origins
- **Rate limiting** on API endpoints
- **Input validation** and sanitization
- **JWT token** authentication
- **Firebase Admin SDK** for secure authentication

### Frontend Security
- **XSS protection** via input sanitization
- **CSRF protection** via SameSite cookies
- **Secure token storage** in httpOnly cookies
- **Input validation** on all forms

## 📝 API Endpoints

### Authentication
- `POST /api/auth/host/login` - Host Google OAuth login
- `POST /api/auth/participant/login` - Participant phone login
- `POST /api/auth/logout` - Logout current user

### Session Management
- `GET /api/session/status` - Get current session status
- `POST /api/session/join` - Join webinar session
- `POST /api/session/leave` - Leave webinar session

### Chat
- `GET /api/chat/messages` - Get chat history
- `POST /api/chat/send` - Send chat message

### Stream
- `GET /api/stream/info` - Get stream information
- `GET /api/stream/status` - Get stream status

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Manual Testing
1. Start both backend and frontend servers
2. Navigate to `http://localhost:3000`
3. Test participant login with authorized phone number
4. Test host login with authorized Google account
5. Verify chat functionality and stream playback

## 🚀 Deployment

### Environment Setup
1. Set up production Firebase project
2. Configure production YouTube live stream
3. Set up environment variables on hosting platform
4. Configure CORS for production domain

### Production Checklist
- [ ] Environment variables configured
- [ ] Firebase production project setup
- [ ] SSL certificates configured
- [ ] CORS origins updated for production
- [ ] Rate limiting configured appropriately
- [ ] Logging configured for production
- [ ] Error monitoring setup

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔧 Troubleshooting

### Common Issues

1. **Firebase Authentication Errors**:
   - Verify Firebase configuration in both frontend and backend
   - Check that Authentication is enabled in Firebase Console
   - Ensure Google OAuth is configured properly

2. **CORS Errors**:
   - Verify `FRONTEND_URL` environment variable
   - Check that CORS is configured for your domain

3. **Stream Not Loading**:
   - Verify YouTube video ID is correct
   - Check that the stream is live and public
   - Ensure network connectivity

4. **Chat Not Working**:
   - Verify Firebase Realtime Database is enabled
   - Check database rules allow read/write access
   - Ensure WebSocket connections are not blocked

### Debug Mode
Set `NODE_ENV=development` in your environment variables to enable detailed logging.

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review the Firebase and YouTube API documentation

---

**Built with ❤️ for secure, real-time webinar experiences**