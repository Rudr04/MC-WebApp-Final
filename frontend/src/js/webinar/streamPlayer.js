class StreamPlayer {
  constructor() {
    this.player = null;
    this.isMuted = true;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.videoId = null;
  }

  async initialize() {
    // Get stream config from backend
    try {
      const config = await apiClient.getStreamConfig();
      this.videoId = config.videoId;
      
      // Load YouTube API
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => this.handleError('Failed to load player');
      document.head.appendChild(tag);
      
      // Set up global callback
      window.onYouTubeIframeAPIReady = () => this.createPlayer();
    } catch (error) {
      console.error('Failed to get stream config:', error);
      this.handleError('Failed to load stream configuration');
    }
  }

  createPlayer() {
    document.getElementById('loadingIndicator').style.display = 'block';
    
    this.player = new YT.Player('player', {
      videoId: this.videoId,
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        fs: 0,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => this.onPlayerReady(event),
        onStateChange: (event) => this.onPlayerStateChange(event),
        onError: (event) => this.onPlayerError(event)
      }
    });
  }

  onPlayerReady(event) {
    document.getElementById('loadingIndicator').style.display = 'none';
    this.retryCount = 0;
    
    // Disable tab navigation to the iframe
    const iframe = document.querySelector('#player');
    if (iframe) {
        iframe.setAttribute('tabindex', '-1');
    }

    try {
      event.target.mute();
      event.target.playVideo();
      this.showNotification('Stream loaded successfully', 'success');
    } catch (error) {
      this.handleError('Failed to start stream playback');
    }
  }

  onPlayerStateChange(event) {
    console.log('Player state changed:', event.data);
    if (event.data === YT.PlayerState.BUFFERING) {
      document.getElementById('loadingIndicator').style.display = 'block';
    } else {
      document.getElementById('loadingIndicator').style.display = 'none';
    }
  }

  onPlayerError(event) {
    const errorMessages = {
      2: 'Invalid video ID',
      5: 'Video not supported',
      100: 'Video not found or private',
      101: 'Video not available in your region',
      150: 'Video not available in your region'
    };
    
    const message = errorMessages[event.data] || 'Stream playback error';
    this.handleError(message);
    
    if (this.retryCount < this.maxRetries) {
      setTimeout(() => this.retry(), 5000);
    }
  }

  handleError(message) {
    console.error('Stream error:', message);
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'block';
    this.showNotification(message, 'error');
  }

  retry() {
    this.retryCount++;
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('loadingIndicator').style.display = 'block';
    
    if (this.player) {
      this.player.loadVideoById(this.videoId);
    }
    
    this.showNotification(`Retrying... (${this.retryCount}/${this.maxRetries})`, 'warning');
  }

  toggleMute() {
    if (!this.player) return;
    
    try {
      if (this.isMuted) {
        this.player.unMute();
        document.getElementById('muteBtn').innerHTML = '<i class="fas fa-volume-up"></i> Mute';
        this.isMuted = false;
      } else {
        this.player.mute();
        document.getElementById('muteBtn').innerHTML = '<i class="fas fa-volume-mute"></i> Unmute';
        this.isMuted = true;
      }
    } catch (error) {
      this.showNotification('Failed to toggle audio', 'error');
    }
  }

  toggleFullscreen() {
    const container = document.getElementById('playerContainer');
    
    try {
      if (!document.fullscreenElement) {
        container.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    } catch (error) {
      this.showNotification('Fullscreen not supported', 'error');
    }
  }

  showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }
}

const streamPlayer = new StreamPlayer();