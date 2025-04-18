document.addEventListener('DOMContentLoaded', () => {
    const videoContainer = document.getElementById('video-container');
    const initialLoadingIndicator = document.querySelector('.loading-indicator');
    const toggleModeButton = document.getElementById('toggle-mode-button');

    let originalVideoUrls = []; // Store the original order
    let activeVideoUrls = [];   // Store the currently used order (sequential or shuffled)
    let currentIndex = 0;
    let currentVideoElement = null;
    let observer;
    let isUpdatingDOM = false;
    let currentModeIsRandom = false; // Start in sequential mode
    let indexDisplayTimeout = null; // Timeout handle for index display

    // --- Configuration ---
    // const USE_RANDOM_ORDER = false; // REMOVED - Now controlled by button
    const RENDER_BUFFER = 2;
    const PRELOAD_AHEAD = 1;
    const INDEX_DISPLAY_DURATION_MS = 2500; // How long to show the index (in milliseconds)
    // --- Configuration End ---

    // Fisher-Yates Shuffle
    function shuffleArray(array) {
        const shuffled = [...array]; // Create a copy to shuffle
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // createVideoSlide function (minor change: uses activeVideoUrls length)
    function createVideoSlide(url, index) {
        const slide = document.createElement('div');
        slide.className = 'video-slide';
        slide.dataset.index = index; // Index within the *active* list

        // Add video element (same as before)
        const video = document.createElement('video');
        video.src = url;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        // video.muted = true;

        video.addEventListener('click', () => {
            togglePlayPause(video);
        });

        video.addEventListener('error', (e) => {
            console.error(`Video loading error (Index ${index}): ${url}`, e);
            displaySlideError(slide, '视频加载失败');
        });

        const videoLoadingIndicator = document.createElement('div');
        videoLoadingIndicator.className = 'loading-indicator';
        videoLoadingIndicator.textContent = '加载中...';
        videoLoadingIndicator.style.fontSize = '14px';
        slide.appendChild(videoLoadingIndicator);

        video.addEventListener('canplay', () => {
             videoLoadingIndicator.remove();
        }, { once: true });

        slide.appendChild(video);
        return slide;
    }

    // displaySlideError function (same as before)
    function displaySlideError(slideElement, message) {
        const existingError = slideElement.querySelector('.slide-error-message');
        if (existingError) existingError.remove();
        const loadingIndicator = slideElement.querySelector('.loading-indicator');
        if (loadingIndicator) loadingIndicator.remove();
        const errorMsg = document.createElement('div');
        errorMsg.textContent = message;
        errorMsg.className = 'error-message slide-error-message';
        errorMsg.style.position = 'absolute';
        slideElement.appendChild(errorMsg);
    }

    // togglePlayPause function (same as before)
    function togglePlayPause(videoElement) {
        if (videoElement.paused) {
            playVideo(videoElement);
        } else {
            pauseVideo(videoElement);
        }
    }

    // --- NEW: Show and hide index display ---
    function showIndexDisplay(slideElement, index) {
        // Remove any previous index display on this slide immediately
        const existingDisplay = slideElement.querySelector('.video-index-display');
        if (existingDisplay) {
            existingDisplay.remove();
        }
        // Clear any pending hide timeout
        if (indexDisplayTimeout) {
            clearTimeout(indexDisplayTimeout);
            indexDisplayTimeout = null;
        }

        const indexDisplay = document.createElement('div');
        indexDisplay.className = 'video-index-display';
        // Display 1-based index for user-friendliness, but track 0-based internally
        indexDisplay.textContent = `# ${index + 1}`;
        slideElement.appendChild(indexDisplay);

        // Force reflow to ensure transition works
        void indexDisplay.offsetWidth;

        // Make it visible
        indexDisplay.classList.add('visible');

        // Set timeout to hide it
        indexDisplayTimeout = setTimeout(() => {
            indexDisplay.classList.remove('visible');
            // Remove element after fade out transition completes
            setTimeout(() => {
                 if (indexDisplay.parentNode === slideElement) { // Check if it wasn't already removed
                    indexDisplay.remove();
                 }
            }, 500); // Corresponds to the transition duration in CSS
            indexDisplayTimeout = null; // Clear the handle
        }, INDEX_DISPLAY_DURATION_MS);
    }

     // --- Modified playVideo to show index ---
     function playVideo(videoElement) {
        if (!videoElement) return;
        const slideElement = videoElement.parentElement;
        const slideIndex = parseInt(slideElement.dataset.index, 10);

        if (currentVideoElement && currentVideoElement !== videoElement && !currentVideoElement.paused) {
            console.log(`Pausing previous video: Index ${currentVideoElement.parentElement.dataset.index}`);
            currentVideoElement.pause();
            // Optionally hide index display of previous video immediately
             const prevSlide = currentVideoElement.parentElement;
             const prevIndexDisplay = prevSlide.querySelector('.video-index-display');
             if (prevIndexDisplay) prevIndexDisplay.remove();
        }

        if (videoElement.paused) {
            console.log(`Attempting to play video: Index ${slideIndex}`);
            videoElement.play().then(() => {
                console.log(`Video playing: Index ${slideIndex}`);
                currentVideoElement = videoElement;
                showIndexDisplay(slideElement, slideIndex); // <<< Show index on successful play
            }).catch(error => {
                console.warn(`Autoplay failed for video ${slideIndex}: `, error);
                 if (!videoElement.muted) {
                    console.log(`Attempting muted playback for video ${slideIndex}`);
                    videoElement.muted = true;
                    videoElement.play().then(() => {
                        console.log(`Muted playback successful for video ${slideIndex}`);
                        currentVideoElement = videoElement;
                        showIndexDisplay(slideElement, slideIndex); // <<< Show index on successful muted play
                    }).catch(muteError => {
                        console.error(`Muted playback also failed for video ${slideIndex}: `, muteError);
                         displaySlideError(videoElement.parentElement, '播放失败，请尝试点击');
                    });
                 } else {
                     displaySlideError(videoElement.parentElement, '播放失败，请尝试点击');
                 }
            });
        } else {
             // If already playing (e.g., user clicked play), ensure index is shown
             currentVideoElement = videoElement;
             showIndexDisplay(slideElement, slideIndex); // <<< Show index if already playing
        }
    }

    // pauseVideo function (modified to potentially hide index)
    function pauseVideo(videoElement) {
        if (videoElement && !videoElement.paused) {
             const slideIndex = videoElement.parentElement.dataset.index;
             console.log(`Pausing video: Index ${slideIndex}`);
            videoElement.pause();
            // Optionally hide index immediately on pause
             const indexDisplay = videoElement.parentElement.querySelector('.video-index-display');
             if (indexDisplay) {
                 indexDisplay.remove();
                 if (indexDisplayTimeout) {
                     clearTimeout(indexDisplayTimeout);
                     indexDisplayTimeout = null;
                 }
             }
        }
        if (currentVideoElement === videoElement) {
            currentVideoElement = null;
        }
    }

    // setupIntersectionObserver function (minor change in callback)
    function setupIntersectionObserver() {
        const options = {
            root: videoContainer,
            rootMargin: '0px',
            threshold: 0.8
        };

        const callback = (entries) => {
            entries.forEach(entry => {
                const slideElement = entry.target;
                const video = slideElement.querySelector('video');
                const slideIndex = parseInt(slideElement.dataset.index, 10);

                if (!video) return;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                    console.log(`Video ${slideIndex} reached threshold`);
                    if (slideIndex !== currentIndex) {
                        currentIndex = slideIndex;
                        // Use setTimeout for updateRenderedSlides to avoid blocking observer
                        setTimeout(updateRenderedSlides, 0);
                    }
                    playVideo(video); // Play video (will handle index display)
                    preloadNeighborVideos(slideIndex);
                } else {
                    if (!video.paused) {
                        pauseVideo(video); // Pause video (will handle index display removal)
                    }
                }
            });
        };
        observer = new IntersectionObserver(callback, options);
        console.log("IntersectionObserver created.");
    }

    // preloadNeighborVideos function (uses activeVideoUrls length)
    function preloadNeighborVideos(centerIndex) {
        for (let i = 1; i <= PRELOAD_AHEAD; i++) {
            // Preload next
            const nextIndex = centerIndex + i;
             // Check bounds against the *active* list length
            if (nextIndex < activeVideoUrls.length) {
                const nextSlide = videoContainer.querySelector(`.video-slide[data-index="${nextIndex}"]`);
                if (nextSlide) {
                    const nextVideo = nextSlide.querySelector('video');
                    if (nextVideo && nextVideo.preload !== 'auto') {
                        console.log(`Preloading video: Index ${nextIndex}`);
                        nextVideo.preload = 'auto';
                    }
                }
            }
            // Preload previous
            const prevIndex = centerIndex - i;
            if (prevIndex >= 0) { // Check lower bound
                 const prevSlide = videoContainer.querySelector(`.video-slide[data-index="${prevIndex}"]`);
                if (prevSlide) {
                    const prevVideo = prevSlide.querySelector('video');
                    if (prevVideo && prevVideo.preload !== 'auto') {
                        console.log(`Preloading video: Index ${prevIndex}`);
                        prevVideo.preload = 'auto';
                    }
                }
            }
        }
    }


    // updateRenderedSlides function (uses activeVideoUrls)
    async function updateRenderedSlides() {
        if (!observer) {
            console.warn("updateRenderedSlides called before observer was initialized.");
            return;
        }
        if (isUpdatingDOM) {
            console.log("DOM update already in progress, skipping.");
            return;
        }
        isUpdatingDOM = true;
        console.log(`Updating rendered slides around index: ${currentIndex}`);

        const requiredStartIndex = Math.max(0, currentIndex - RENDER_BUFFER);
        // Use activeVideoUrls.length for upper bound
        const requiredEndIndex = Math.min(activeVideoUrls.length - 1, currentIndex + RENDER_BUFFER);

        const currentSlides = new Map();
        videoContainer.querySelectorAll('.video-slide').forEach(slide => {
            currentSlides.set(parseInt(slide.dataset.index, 10), slide);
        });

        const slidesToRemove = [];
        const indicesToAdd = [];

        currentSlides.forEach((slide, index) => {
            if (index < requiredStartIndex || index > requiredEndIndex) {
                slidesToRemove.push(slide);
            }
        });

        for (let i = requiredStartIndex; i <= requiredEndIndex; i++) {
            // Ensure index is valid for activeVideoUrls
            if (i >= 0 && i < activeVideoUrls.length && !currentSlides.has(i)) {
                indicesToAdd.push(i);
            }
        }

        // --- Perform DOM Operations ---
        if (slidesToRemove.length > 0) {
            console.log(`Removing ${slidesToRemove.length} slides.`);
            slidesToRemove.forEach(slide => {
                const video = slide.querySelector('video');
                if (video && !video.paused) video.pause();
                observer.unobserve(slide);
                slide.remove();
                console.log(`Removed slide: Index ${slide.dataset.index}`);
            });
        }

        if (indicesToAdd.length > 0) {
            console.log(`Adding ${indicesToAdd.length} new slides.`);
            indicesToAdd.sort((a, b) => a - b);

            indicesToAdd.forEach(index => {
                // Check index bounds again just in case
                if (index >= 0 && index < activeVideoUrls.length) {
                    // Use URL from activeVideoUrls
                    const newSlide = createVideoSlide(activeVideoUrls[index], index);
                    let inserted = false;
                    const existingSlides = videoContainer.querySelectorAll('.video-slide');
                    for (let j = 0; j < existingSlides.length; j++) {
                        const existingSlideIndex = parseInt(existingSlides[j].dataset.index, 10);
                        if (existingSlideIndex > index) {
                            videoContainer.insertBefore(newSlide, existingSlides[j]);
                            inserted = true;
                            break;
                        }
                    }
                    if (!inserted) {
                        videoContainer.appendChild(newSlide);
                    }
                    observer.observe(newSlide);
                    console.log(`Added and observing slide: Index ${index}`);
                } else {
                     console.warn(`Attempted to add slide with invalid index: ${index}`);
                }
            });
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        isUpdatingDOM = false;
        console.log("DOM update finished.");
    }

    // --- NEW: Function to handle mode toggle ---
    async function handleToggleMode() {
        currentModeIsRandom = !currentModeIsRandom; // Toggle the mode flag
        console.log(`Switching mode. Random mode is now: ${currentModeIsRandom}`);

        // Update the button text
        toggleModeButton.textContent = currentModeIsRandom ? '切换顺序' : '切换随机';

        // Update the active video list
        if (currentModeIsRandom) {
            activeVideoUrls = shuffleArray(originalVideoUrls);
        } else {
            activeVideoUrls = [...originalVideoUrls]; // Use a copy of the original
        }

        // Reset state and UI
        currentIndex = 0; // Go back to the beginning of the new list
        currentVideoElement = null; // No video is playing
        if (indexDisplayTimeout) { // Clear any pending index display timeout
             clearTimeout(indexDisplayTimeout);
             indexDisplayTimeout = null;
        }

        // Clear existing slides from the container
        console.log("Clearing existing slides...");
        // Stop observing all current slides before removing
        videoContainer.querySelectorAll('.video-slide').forEach(slide => observer.unobserve(slide));
        videoContainer.innerHTML = ''; // Remove all children

        // Show a temporary loading state? Optional.
        // videoContainer.innerHTML = '<div class="loading-indicator">切换模式中...</div>';
        // await new Promise(resolve => setTimeout(resolve, 50)); // Short delay

        // Re-render slides based on the new list and currentIndex (0)
        console.log("Rendering initial slides for new mode...");
        await updateRenderedSlides();

        // Scroll to the top (first video)
        console.log("Scrolling to top...");
         videoContainer.scrollTop = 0; // Instant scroll to top is usually fine here

        // Find and potentially preload the new first video after render
        const firstSlide = videoContainer.querySelector('.video-slide[data-index="0"]');
        if (firstSlide) {
             // Let the observer trigger play, but preload neighbors
             preloadNeighborVideos(0);
        } else {
            console.warn("Could not find the first slide after mode toggle.");
        }
    }


    // Initialize function (modified)
    async function initialize() {
        try {
            const response = await fetch('index.txt');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const text = await response.text();
            originalVideoUrls = text.split('\n').map(line => line.trim()).filter(line => line); // Store original

            if (originalVideoUrls.length === 0) throw new Error('index.txt is empty or invalid.');
            console.log(`Loaded ${originalVideoUrls.length} video URLs.`);

            // Set initial active list based on starting mode (sequential)
            activeVideoUrls = [...originalVideoUrls];
            currentModeIsRandom = false; // Explicitly set initial state
            toggleModeButton.textContent = '切换随机'; // Set initial button text

            if (initialLoadingIndicator) initialLoadingIndicator.remove();

            // Setup observer FIRST
            setupIntersectionObserver();

            // Render initial slides using activeVideoUrls
            await updateRenderedSlides();

            // Add event listener for the toggle button
            toggleModeButton.addEventListener('click', handleToggleMode);

            // Scroll to the first slide initially
            const firstSlide = videoContainer.querySelector('.video-slide[data-index="0"]');
            if (firstSlide) {
                 setTimeout(() => {
                      if (document.body.contains(firstSlide)) {
                           firstSlide.scrollIntoView({ behavior: 'auto', block: 'start' });
                           console.log("Scrolled to initial video.");
                           preloadNeighborVideos(0); // Preload neighbors
                      }
                 }, 150);
            } else {
                console.warn("Could not find the initial slide (index 0) to scroll to or render.");
                 // Handle case where index.txt might be valid but very short, or other issues
                 if (activeVideoUrls.length > 0) {
                     console.error("Initialization state inconsistent: Videos loaded but first slide not found.");
                 } else {
                      displaySlideError(videoContainer, "没有可显示的视频"); // Show error if no videos loaded at all
                 }
            }

        } catch (error) {
            console.error('Initialization failed:', error);
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.textContent = `Error loading videos: ${error.message}. Please check index.txt and network connection.`;
            videoContainer.innerHTML = '';
            videoContainer.appendChild(errorElement);
            if (initialLoadingIndicator) initialLoadingIndicator.remove();
            toggleModeButton.disabled = true; // Disable button if init fails
        }
    }

    // Start
    initialize();
});
