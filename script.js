document.addEventListener('DOMContentLoaded', () => {
    const videoContainer = document.getElementById('video-container');
    const initialLoadingIndicator = document.querySelector('.loading-indicator');
    const toggleModeButton = document.getElementById('toggle-mode-button');

    let originalVideoUrls = []; // Store the original order URLs
    let activeVideoUrls = [];   // Store the currently used order URLs
    let urlToOriginalIndexMap = new Map(); // <<< NEW: Map URL to its original line index (0-based)

    let currentIndex = 0; // Index within the *active* list
    let currentVideoElement = null;
    let observer;
    let isUpdatingDOM = false;
    let currentModeIsRandom = false;
    let indexDisplayTimeout = null;

    // --- Configuration ---
    const RENDER_BUFFER = 2;
    const PRELOAD_AHEAD = 1;
    const INDEX_DISPLAY_DURATION_MS = 2500;
    // --- Configuration End ---

    // Fisher-Yates Shuffle (same as before)
    function shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // createVideoSlide function (no major change needed here)
    // It still receives the index relative to the *active* list for data-index attribute
    function createVideoSlide(url, activeIndex) {
        const slide = document.createElement('div');
        slide.className = 'video-slide';
        slide.dataset.index = activeIndex; // Store the active index for DOM management

        // Add video element (same as before)
        const video = document.createElement('video');
        video.src = url; // The URL is stored here
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        // video.muted = true;

        video.addEventListener('click', () => {
            togglePlayPause(video);
        });

        video.addEventListener('error', (e) => {
            // Use the URL to find original index for error message
            const originalIndex = urlToOriginalIndexMap.get(url);
            const displayIndex = originalIndex !== undefined ? originalIndex + 1 : '?';
            console.error(`Video loading error (Original Line ${displayIndex}, URL: ${url})`, e);
            displaySlideError(slide, `视频加载失败 (源行: ${displayIndex})`);
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

    // --- MODIFIED: Show and hide index display using original line number ---
    function showIndexDisplay(slideElement) {
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

        const video = slideElement.querySelector('video');
        if (!video) return; // Should not happen

        const url = video.src;
        const originalIndex = urlToOriginalIndexMap.get(url); // <<< Get original index from map

        if (originalIndex === undefined) {
            console.warn(`Could not find original index for URL: ${url}`);
            return; // Don't display if mapping failed
        }

        const indexDisplay = document.createElement('div');
        indexDisplay.className = 'video-index-display';
        // Display 1-based original line number
        indexDisplay.textContent = `# ${originalIndex + 1}`; // <<< Use originalIndex
        slideElement.appendChild(indexDisplay);

        // Force reflow
        void indexDisplay.offsetWidth;

        // Make it visible
        indexDisplay.classList.add('visible');

        // Set timeout to hide it
        indexDisplayTimeout = setTimeout(() => {
            indexDisplay.classList.remove('visible');
            setTimeout(() => {
                 if (indexDisplay.parentNode === slideElement) {
                    indexDisplay.remove();
                 }
            }, 500);
            indexDisplayTimeout = null;
        }, INDEX_DISPLAY_DURATION_MS);
    }

     // --- Modified playVideo to call updated showIndexDisplay ---
     function playVideo(videoElement) {
        if (!videoElement) return;
        const slideElement = videoElement.parentElement;
        // const slideIndex = parseInt(slideElement.dataset.index, 10); // Active index, not needed for display now

        if (currentVideoElement && currentVideoElement !== videoElement && !currentVideoElement.paused) {
            console.log(`Pausing previous video: Index ${currentVideoElement.parentElement.dataset.index}`);
            currentVideoElement.pause();
             const prevSlide = currentVideoElement.parentElement;
             const prevIndexDisplay = prevSlide.querySelector('.video-index-display');
             if (prevIndexDisplay) prevIndexDisplay.remove();
        }

        if (videoElement.paused) {
            const url = videoElement.src;
            const originalIndex = urlToOriginalIndexMap.get(url);
            const displayIndex = originalIndex !== undefined ? originalIndex + 1 : '?';
            console.log(`Attempting to play video: Original Line ${displayIndex}`);

            videoElement.play().then(() => {
                console.log(`Video playing: Original Line ${displayIndex}`);
                currentVideoElement = videoElement;
                showIndexDisplay(slideElement); // <<< Call with slideElement only
            }).catch(error => {
                console.warn(`Autoplay failed for video (Original Line ${displayIndex}): `, error);
                 if (!videoElement.muted) {
                    console.log(`Attempting muted playback for video (Original Line ${displayIndex})`);
                    videoElement.muted = true;
                    videoElement.play().then(() => {
                        console.log(`Muted playback successful for video (Original Line ${displayIndex})`);
                        currentVideoElement = videoElement;
                        showIndexDisplay(slideElement); // <<< Call with slideElement only
                    }).catch(muteError => {
                        console.error(`Muted playback also failed for video (Original Line ${displayIndex}): `, muteError);
                         displaySlideError(videoElement.parentElement, `播放失败 (源行: ${displayIndex})`);
                    });
                 } else {
                     displaySlideError(videoElement.parentElement, `播放失败 (源行: ${displayIndex})`);
                 }
            });
        } else {
             // If already playing
             currentVideoElement = videoElement;
             showIndexDisplay(slideElement); // <<< Call with slideElement only
        }
    }

    // pauseVideo function (same as before, implicitly handles index removal via playVideo)
    function pauseVideo(videoElement) {
        if (videoElement && !videoElement.paused) {
             const url = videoElement.src;
             const originalIndex = urlToOriginalIndexMap.get(url);
             const displayIndex = originalIndex !== undefined ? originalIndex + 1 : '?';
             console.log(`Pausing video: Original Line ${displayIndex}`);
            videoElement.pause();
            // Index removal is handled when the *next* video plays or by timeout
        }
        if (currentVideoElement === videoElement) {
            currentVideoElement = null;
        }
    }

    // setupIntersectionObserver function (no change needed here)
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
                const slideIndex = parseInt(slideElement.dataset.index, 10); // Active index

                if (!video) return;

                if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                    // console.log(`Video ${slideIndex} reached threshold`); // Log active index
                    if (slideIndex !== currentIndex) {
                        currentIndex = slideIndex;
                        setTimeout(updateRenderedSlides, 0);
                    }
                    playVideo(video);
                    preloadNeighborVideos(slideIndex); // Preload based on active index
                } else {
                    if (!video.paused) {
                        pauseVideo(video);
                    }
                }
            });
        };
        observer = new IntersectionObserver(callback, options);
        console.log("IntersectionObserver created.");
    }

    // preloadNeighborVideos function (no change needed here, uses active index)
    function preloadNeighborVideos(centerIndex) {
        for (let i = 1; i <= PRELOAD_AHEAD; i++) {
            const nextIndex = centerIndex + i;
            if (nextIndex < activeVideoUrls.length) {
                const nextSlide = videoContainer.querySelector(`.video-slide[data-index="${nextIndex}"]`);
                if (nextSlide) {
                    const nextVideo = nextSlide.querySelector('video');
                    if (nextVideo && nextVideo.preload !== 'auto') {
                        // console.log(`Preloading video: Active Index ${nextIndex}`);
                        nextVideo.preload = 'auto';
                    }
                }
            }
            const prevIndex = centerIndex - i;
            if (prevIndex >= 0) {
                 const prevSlide = videoContainer.querySelector(`.video-slide[data-index="${prevIndex}"]`);
                if (prevSlide) {
                    const prevVideo = prevSlide.querySelector('video');
                    if (prevVideo && prevVideo.preload !== 'auto') {
                        // console.log(`Preloading video: Active Index ${prevIndex}`);
                        prevVideo.preload = 'auto';
                    }
                }
            }
        }
    }

    // updateRenderedSlides function (no change needed here, uses active urls/indices)
    async function updateRenderedSlides() {
        if (!observer) return;
        if (isUpdatingDOM) return;
        isUpdatingDOM = true;
        // console.log(`Updating rendered slides around active index: ${currentIndex}`);

        const requiredStartIndex = Math.max(0, currentIndex - RENDER_BUFFER);
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
            if (i >= 0 && i < activeVideoUrls.length && !currentSlides.has(i)) {
                indicesToAdd.push(i);
            }
        }

        // --- Perform DOM Operations ---
        if (slidesToRemove.length > 0) {
            // console.log(`Removing ${slidesToRemove.length} slides.`);
            slidesToRemove.forEach(slide => {
                const video = slide.querySelector('video');
                if (video && !video.paused) video.pause();
                observer.unobserve(slide);
                slide.remove();
                // console.log(`Removed slide: Active Index ${slide.dataset.index}`);
            });
        }

        if (indicesToAdd.length > 0) {
            // console.log(`Adding ${indicesToAdd.length} new slides.`);
            indicesToAdd.sort((a, b) => a - b);

            indicesToAdd.forEach(index => { // index here is the *active* index
                if (index >= 0 && index < activeVideoUrls.length) {
                    const url = activeVideoUrls[index]; // Get URL from active list
                    const newSlide = createVideoSlide(url, index); // Pass URL and active index
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
                    // console.log(`Added and observing slide: Active Index ${index}`);
                }
            });
        }

        await new Promise(resolve => setTimeout(resolve, 50));
        isUpdatingDOM = false;
        // console.log("DOM update finished.");
    }

    // handleToggleMode function (no change needed here)
    async function handleToggleMode() {
         currentModeIsRandom = !currentModeIsRandom;
        console.log(`Switching mode. Random mode is now: ${currentModeIsRandom}`);
        toggleModeButton.textContent = currentModeIsRandom ? '切换顺序' : '切换随机';

        if (currentModeIsRandom) {
            activeVideoUrls = shuffleArray(originalVideoUrls);
        } else {
            activeVideoUrls = [...originalVideoUrls];
        }

        currentIndex = 0;
        currentVideoElement = null;
        if (indexDisplayTimeout) {
             clearTimeout(indexDisplayTimeout);
             indexDisplayTimeout = null;
        }

        console.log("Clearing existing slides...");
        videoContainer.querySelectorAll('.video-slide').forEach(slide => observer.unobserve(slide));
        videoContainer.innerHTML = '';

        console.log("Rendering initial slides for new mode...");
        await updateRenderedSlides();

        console.log("Scrolling to top...");
         videoContainer.scrollTop = 0;

        const firstSlide = videoContainer.querySelector('.video-slide[data-index="0"]');
        if (firstSlide) {
             preloadNeighborVideos(0);
        } else {
            console.warn("Could not find the first slide after mode toggle.");
        }
    }

    // Initialize function (MODIFIED to create the map)
    async function initialize() {
        try {
            const response = await fetch('index.txt');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const text = await response.text();
            originalVideoUrls = text.split('\n').map(line => line.trim()).filter(line => line);

            if (originalVideoUrls.length === 0) throw new Error('index.txt is empty or invalid.');
            console.log(`Loaded ${originalVideoUrls.length} video URLs.`);

            // <<< --- NEW: Create the URL to Original Index Map --- >>>
            urlToOriginalIndexMap.clear(); // Clear previous map if any
            originalVideoUrls.forEach((url, index) => {
                if (!urlToOriginalIndexMap.has(url)) {
                    urlToOriginalIndexMap.set(url, index); // Map URL -> 0-based index
                } else {
                    // Handle duplicate URLs if necessary (e.g., log warning)
                    console.warn(`Duplicate URL found at line ${index + 1}: ${url}. Mapping will point to the first occurrence.`);
                }
            });
            console.log("URL to original index map created.");
            // <<< --- End of Map Creation --- >>>

            activeVideoUrls = [...originalVideoUrls];
            currentModeIsRandom = false;
            toggleModeButton.textContent = '切换随机';

            if (initialLoadingIndicator) initialLoadingIndicator.remove();

            setupIntersectionObserver();

            await updateRenderedSlides();

            toggleModeButton.addEventListener('click', handleToggleMode);

            const firstSlide = videoContainer.querySelector('.video-slide[data-index="0"]');
            if (firstSlide) {
                 setTimeout(() => {
                      if (document.body.contains(firstSlide)) {
                           firstSlide.scrollIntoView({ behavior: 'auto', block: 'start' });
                           console.log("Scrolled to initial video.");
                           preloadNeighborVideos(0);
                      }
                 }, 150);
            } else {
                console.warn("Could not find the initial slide (index 0) to scroll to or render.");
                 if (activeVideoUrls.length > 0) {
                     console.error("Initialization state inconsistent: Videos loaded but first slide not found.");
                 } else {
                      displaySlideError(videoContainer, "没有可显示的视频");
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
            toggleModeButton.disabled = true;
        }
    }

    // Start
    initialize();
});
