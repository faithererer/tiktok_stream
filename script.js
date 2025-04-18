document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const videoContainer = document.getElementById('video-container');
    const initialLoadingIndicator = document.querySelector('.loading-indicator');
    const toggleModeButton = document.getElementById('toggle-mode-button');
    const jumpInput = document.getElementById('jump-input');
    const jumpButton = document.getElementById('jump-button');
    const controlsContainer = document.getElementById('controls');

    // --- State Variables ---
    let originalVideoUrls = []; // Stores the original order from index.txt
    let activeVideoUrls = [];   // Stores the currently used order (sequential or shuffled)
    let urlToOriginalIndexMap = new Map(); // Maps URL to its original 0-based line index
    let currentIndex = 0; // Index within the *active* list of the currently centered video
    let currentVideoElement = null; // Reference to the currently playing video element
    let observer; // IntersectionObserver instance
    let isUpdatingDOM = false; // Flag to prevent concurrent DOM updates
    let currentModeIsRandom = true; // Start in Random mode by default
    let indexDisplayTimeout = null; // Timeout handle for hiding the index display
    let isJumping = false; // Flag to manage state during jump navigation

    // --- Configuration ---
    const RENDER_BUFFER = 2; // Number of slides to render above and below the current one
    const PRELOAD_AHEAD = 1; // Number of videos ahead/behind to start preloading
    const INDEX_DISPLAY_DURATION_MS = 2500; // How long the index number stays visible (milliseconds)
    const JUMP_SCROLL_DELAY_MS = 600; // Delay after smooth scroll before re-enabling controls
    // --- Configuration End ---

    // --- Utility Functions ---

    // Fisher-Yates (Knuth) Shuffle Algorithm
    function shuffleArray(array) {
        const shuffled = [...array]; // Create a copy to avoid modifying the original
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; // Swap elements
        }
        return shuffled;
    }

    // --- Core Video/Slide Functions ---

    // Creates a single video slide element
    function createVideoSlide(url, activeIndex) {
        const slide = document.createElement('div');
        slide.className = 'video-slide';
        // Store the index within the *active* list for DOM management and observer logic
        slide.dataset.index = activeIndex;

        const video = document.createElement('video');
        video.src = url; // The URL is the key identifier
        video.loop = true;
        video.playsInline = true; // Important for mobile browsers
        video.preload = 'metadata'; // Load enough to get dimensions/duration initially
        // video.muted = true; // Consider starting muted if autoplay issues persist

        // Toggle play/pause on click, but not during a jump animation
        video.addEventListener('click', () => {
            if (!isJumping) {
                togglePlayPause(video);
            }
        });

        // Handle video loading errors
        video.addEventListener('error', (e) => {
            const originalIndex = urlToOriginalIndexMap.get(url);
            const displayIndex = originalIndex !== undefined ? originalIndex + 1 : '?';
            console.error(`Video loading error (Original Line ${displayIndex}, URL: ${url})`, e);
            displaySlideError(slide, `视频加载失败 (源行: ${displayIndex})`);
        });

        // Add a loading indicator specific to this video
        const videoLoadingIndicator = document.createElement('div');
        videoLoadingIndicator.className = 'loading-indicator';
        videoLoadingIndicator.textContent = '加载中...';
        videoLoadingIndicator.style.fontSize = '14px'; // Smaller indicator
        slide.appendChild(videoLoadingIndicator);

        // Remove loading indicator once the video can play
        video.addEventListener('canplay', () => {
             videoLoadingIndicator.remove();
        }, { once: true }); // Use {once: true} to automatically remove the listener

        slide.appendChild(video);
        return slide;
    }

    // Displays an error message within a specific slide
    function displaySlideError(slideElement, message) {
        // Remove any existing error/loading indicators first
        const existingError = slideElement.querySelector('.slide-error-message');
        if (existingError) existingError.remove();
        const loadingIndicator = slideElement.querySelector('.loading-indicator');
        if (loadingIndicator) loadingIndicator.remove();

        const errorMsg = document.createElement('div');
        errorMsg.textContent = message;
        errorMsg.className = 'error-message slide-error-message'; // Use specific class
        slideElement.appendChild(errorMsg);
    }

    // Toggles the play/pause state of a video element
    function togglePlayPause(videoElement) {
        if (!videoElement) return;
        if (videoElement.paused) {
            playVideo(videoElement);
        } else {
            pauseVideo(videoElement);
        }
    }

    // Shows the original index number temporarily on the slide
    function showIndexDisplay(slideElement) {
        // Remove any previous index display on this slide immediately
        const existingDisplay = slideElement.querySelector('.video-index-display');
        if (existingDisplay) {
            existingDisplay.remove();
        }
        // Clear any pending hide timeout from a previous video
        if (indexDisplayTimeout) {
            clearTimeout(indexDisplayTimeout);
            indexDisplayTimeout = null;
        }

        const video = slideElement.querySelector('video');
        if (!video) return; // Safety check

        const url = video.src;
        const originalIndex = urlToOriginalIndexMap.get(url); // Get original index from map

        if (originalIndex === undefined) {
            console.warn(`Could not find original index for URL: ${url}`);
            return; // Don't display if mapping failed
        }

        const indexDisplay = document.createElement('div');
        indexDisplay.className = 'video-index-display';
        // Display 1-based original line number for user readability
        indexDisplay.textContent = `# ${originalIndex + 1}`;
        slideElement.appendChild(indexDisplay);

        // Force reflow/repaint to ensure CSS transition applies correctly
        void indexDisplay.offsetWidth;

        // Add 'visible' class to trigger fade-in animation
        indexDisplay.classList.add('visible');

        // Set a timeout to hide and remove the index display
        indexDisplayTimeout = setTimeout(() => {
            if (indexDisplay.parentNode === slideElement) { // Check if still attached
                 indexDisplay.classList.remove('visible');
                 // Remove the element completely after the fade-out transition completes
                 setTimeout(() => {
                      if (indexDisplay.parentNode === slideElement) {
                         indexDisplay.remove();
                      }
                 }, 500); // Match CSS transition duration
            }
            indexDisplayTimeout = null; // Clear the timeout handle
        }, INDEX_DISPLAY_DURATION_MS);
    }

     // Attempts to play a video, handling potential autoplay restrictions
     function playVideo(videoElement) {
        if (!videoElement) return;
        const slideElement = videoElement.parentElement;
        const url = videoElement.src;
        const originalIndex = urlToOriginalIndexMap.get(url);
        const displayIndex = originalIndex !== undefined ? originalIndex + 1 : '?';

        // Pause the previously playing video, if any
        if (currentVideoElement && currentVideoElement !== videoElement && !currentVideoElement.paused) {
            console.log(`Pausing previous video: Original Line ${urlToOriginalIndexMap.get(currentVideoElement.src) + 1}`);
            currentVideoElement.pause();
            // Immediately remove index display from previous video
             const prevSlide = currentVideoElement.parentElement;
             const prevIndexDisplay = prevSlide?.querySelector('.video-index-display');
             if (prevIndexDisplay) prevIndexDisplay.remove();
        }

        if (videoElement.paused) {
            console.log(`Attempting to play video: Original Line ${displayIndex}`);
            const playPromise = videoElement.play();

            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log(`Video playing: Original Line ${displayIndex}`);
                    currentVideoElement = videoElement;
                    showIndexDisplay(slideElement); // Show index on successful play
                }).catch(error => {
                    console.warn(`Autoplay failed for video (Original Line ${displayIndex}): `, error);
                    // Attempt muted playback as a fallback
                     if (!videoElement.muted) {
                        console.log(`Attempting muted playback for video (Original Line ${displayIndex})`);
                        videoElement.muted = true;
                        videoElement.play().then(() => {
                            console.log(`Muted playback successful for video (Original Line ${displayIndex})`);
                            currentVideoElement = videoElement;
                            showIndexDisplay(slideElement); // Show index on successful muted play
                        }).catch(muteError => {
                            console.error(`Muted playback also failed for video (Original Line ${displayIndex}): `, muteError);
                            displaySlideError(slideElement, `播放失败，请点击 (源行: ${displayIndex})`);
                        });
                     } else {
                         // Already muted and failed, show error
                         displaySlideError(slideElement, `播放失败，请点击 (源行: ${displayIndex})`);
                     }
                });
            }
        } else {
             // If already playing (e.g., user clicked play), ensure index is shown
             currentVideoElement = videoElement;
             showIndexDisplay(slideElement);
        }
    }

    // Pauses a video element if it's playing
    function pauseVideo(videoElement) {
        if (videoElement && !videoElement.paused) {
             const url = videoElement.src;
             const originalIndex = urlToOriginalIndexMap.get(url);
             const displayIndex = originalIndex !== undefined ? originalIndex + 1 : '?';
             console.log(`Pausing video: Original Line ${displayIndex}`);
            videoElement.pause();
            // Note: Index display removal is handled by its own timeout or when the next video plays
        }
        // Clear currentVideoElement if it's the one being paused
        if (currentVideoElement === videoElement) {
            currentVideoElement = null;
        }
    }

    // --- Intersection Observer Logic ---

    // Sets up the Intersection Observer to monitor slide visibility
    function setupIntersectionObserver() {
         const options = {
            root: videoContainer, // Observe intersections within the container
            rootMargin: '0px',
            threshold: 0.8 // Trigger when 80% of the slide is visible
        };

        // Callback function executed when intersection changes
        const callback = (entries) => {
            if (isJumping) return; // Don't process observer changes during a jump

            entries.forEach(entry => {
                const slideElement = entry.target;
                const video = slideElement.querySelector('video');
                // Get the index within the *active* list from the dataset
                const slideActiveIndex = parseInt(slideElement.dataset.index, 10);

                if (!video) return; // Should not happen

                // Check if the slide is intersecting and meets the threshold
                if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
                    // Update the global currentIndex if this intersecting slide is different
                    if (slideActiveIndex !== currentIndex) {
                        currentIndex = slideActiveIndex;
                        // Update the rendered slides asynchronously to avoid blocking observer
                        setTimeout(updateRenderedSlides, 0);
                    }
                    playVideo(video); // Play the video that came into view
                    preloadNeighborVideos(slideActiveIndex); // Preload videos around this new index
                } else {
                    // If the slide is no longer sufficiently visible, pause its video
                    if (!video.paused) {
                        pauseVideo(video);
                    }
                }
            });
        };

        // Create and store the observer instance
        observer = new IntersectionObserver(callback, options);
        console.log("IntersectionObserver created.");
    }

    // --- DOM Management and Preloading ---

    // Preloads metadata/data for videos adjacent to the current one
    function preloadNeighborVideos(centerActiveIndex) {
        for (let i = 1; i <= PRELOAD_AHEAD; i++) {
            // Preload next video(s)
            const nextIndex = centerActiveIndex + i;
            if (nextIndex < activeVideoUrls.length) { // Check bounds of active list
                const nextSlide = videoContainer.querySelector(`.video-slide[data-index="${nextIndex}"]`);
                if (nextSlide) {
                    const nextVideo = nextSlide.querySelector('video');
                    // Change preload attribute to 'auto' to encourage loading
                    if (nextVideo && nextVideo.preload !== 'auto') {
                        // console.log(`Preloading video: Active Index ${nextIndex}`);
                        nextVideo.preload = 'auto';
                    }
                }
            }
            // Preload previous video(s)
            const prevIndex = centerActiveIndex - i;
            if (prevIndex >= 0) { // Check bounds of active list
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

    // Updates the DOM to only contain slides within the RENDER_BUFFER around currentIndex
    async function updateRenderedSlides() {
        if (!observer) {
            console.warn("updateRenderedSlides called before observer was initialized.");
            return;
        }
        if (isUpdatingDOM) {
            // console.log("DOM update already in progress, skipping.");
            return;
        }
        isUpdatingDOM = true;
        // console.log(`Updating rendered slides around active index: ${currentIndex}`);

        // Calculate the range of active indices that should be rendered
        const requiredStartIndex = Math.max(0, currentIndex - RENDER_BUFFER);
        const requiredEndIndex = Math.min(activeVideoUrls.length - 1, currentIndex + RENDER_BUFFER);

        // Map currently rendered slides by their active index
        const currentSlides = new Map();
        videoContainer.querySelectorAll('.video-slide').forEach(slide => {
            currentSlides.set(parseInt(slide.dataset.index, 10), slide);
        });

        const slidesToRemove = [];
        const indicesToAdd = []; // Active indices to add

        // Identify slides outside the required range
        currentSlides.forEach((slide, index) => {
            if (index < requiredStartIndex || index > requiredEndIndex) {
                slidesToRemove.push(slide);
            }
        });

        // Identify required indices that are not currently rendered
        for (let i = requiredStartIndex; i <= requiredEndIndex; i++) {
            // Ensure index is valid for activeVideoUrls
            if (i >= 0 && i < activeVideoUrls.length && !currentSlides.has(i)) {
                indicesToAdd.push(i);
            }
        }

        // --- Perform DOM Operations ---

        // Remove slides outside the buffer
        if (slidesToRemove.length > 0) {
            // console.log(`Removing ${slidesToRemove.length} slides.`);
            slidesToRemove.forEach(slide => {
                const video = slide.querySelector('video');
                if (video && !video.paused) video.pause(); // Pause before removing
                observer.unobserve(slide); // Stop observing before removing
                slide.remove();
                // console.log(`Removed slide: Active Index ${slide.dataset.index}`);
            });
        }

        // Add new slides within the buffer
        if (indicesToAdd.length > 0) {
             // console.log(`Adding ${indicesToAdd.length} new slides.`);
             indicesToAdd.sort((a, b) => a - b); // Add in correct order

             indicesToAdd.forEach(activeIndex => { // index here is the *active* index
                if (activeIndex >= 0 && activeIndex < activeVideoUrls.length) {
                    const url = activeVideoUrls[activeIndex]; // Get URL from active list
                    const newSlide = createVideoSlide(url, activeIndex); // Create slide

                    // Insert the new slide at the correct position in the DOM
                    let inserted = false;
                    const existingSlides = videoContainer.querySelectorAll('.video-slide');
                    for (let j = 0; j < existingSlides.length; j++) {
                        const existingSlideIndex = parseInt(existingSlides[j].dataset.index, 10);
                        if (existingSlideIndex > activeIndex) {
                            videoContainer.insertBefore(newSlide, existingSlides[j]);
                            inserted = true;
                            break;
                        }
                    }
                    // If not inserted (i.e., it's the last one), append it
                    if (!inserted) {
                        videoContainer.appendChild(newSlide);
                    }
                    observer.observe(newSlide); // Start observing the new slide
                    // console.log(`Added and observing slide: Active Index ${activeIndex}`);
                } else {
                     console.warn(`Attempted to add slide with invalid active index: ${activeIndex}`);
                }
            });
        }

        // Short delay to allow DOM updates to settle before releasing the lock
        await new Promise(resolve => setTimeout(resolve, 50));
        isUpdatingDOM = false;
        // console.log("DOM update finished.");
    }

    // --- UI Interaction Handlers ---

    // Handles the click on the toggle mode button (Random/Sequential)
    async function handleToggleMode() {
        currentModeIsRandom = !currentModeIsRandom; // Toggle the mode flag
        console.log(`Switching mode. Random mode is now: ${currentModeIsRandom}`);

        // Update the button text accordingly
        toggleModeButton.textContent = currentModeIsRandom ? '切换顺序' : '切换随机';

        // Update the active video list based on the new mode
        if (currentModeIsRandom) {
            activeVideoUrls = shuffleArray(originalVideoUrls);
        } else {
            activeVideoUrls = [...originalVideoUrls]; // Use a fresh copy of the original order
        }

        // Reset state
        currentIndex = 0; // Go back to the beginning of the new list
        currentVideoElement = null; // No video is considered playing
        if (indexDisplayTimeout) { // Clear any lingering index display timeout
             clearTimeout(indexDisplayTimeout);
             indexDisplayTimeout = null;
        }

        // Clear existing slides from the container efficiently
        console.log("Clearing existing slides for mode toggle...");
        // Stop observing all current slides before removing them
        videoContainer.querySelectorAll('.video-slide').forEach(slide => observer.unobserve(slide));
        videoContainer.innerHTML = ''; // Remove all child elements

        // Re-render slides based on the new list starting from index 0
        console.log("Rendering initial slides for new mode...");
        await updateRenderedSlides();

        // Scroll to the top (first video) of the container
        console.log("Scrolling to top...");
         videoContainer.scrollTop = 0; // Instant scroll to top is usually fine here

        // Find and preload the new first video's neighbors after rendering
        const firstSlide = videoContainer.querySelector('.video-slide[data-index="0"]');
        if (firstSlide) {
             preloadNeighborVideos(0);
        } else {
            console.warn("Could not find the first slide after mode toggle.");
        }
    }

    // Handles the click on the jump button or Enter key in the input
    async function handleJumpToVideo() {
        if (isJumping) return; // Prevent concurrent jumps

        const targetLineNumber = parseInt(jumpInput.value, 10);

        // --- Input Validation ---
        if (isNaN(targetLineNumber) || targetLineNumber < 1 || targetLineNumber > originalVideoUrls.length) {
            alert(`请输入有效的行号 (1 到 ${originalVideoUrls.length})`);
            jumpInput.value = ''; // Clear invalid input
            jumpInput.focus();
            return;
        }

        const targetOriginalIndex = targetLineNumber - 1; // Convert to 0-based index
        const targetUrl = originalVideoUrls[targetOriginalIndex]; // Get the URL from the original list

        // --- Find the URL in the *current* active list ---
        const targetActiveIndex = activeVideoUrls.findIndex(url => url === targetUrl);

        if (targetActiveIndex === -1) {
            // This *shouldn't* normally happen if activeUrls is just a reordering of originalUrls
            console.error(`Error: URL from line ${targetLineNumber} (${targetUrl}) not found in the current active list.`);
            alert(`无法在当前播放列表找到行号 ${targetLineNumber} 对应的视频。请尝试切换播放模式。`);
            jumpInput.value = '';
            return;
        }

        console.log(`Jumping to Original Line: ${targetLineNumber} (Target Active Index: ${targetActiveIndex})`);
        isJumping = true; // Set jump flag to prevent observer actions/clicks
        jumpButton.disabled = true; // Disable controls during jump
        jumpInput.disabled = true;

        // --- Perform the Jump ---
        try {
            // 1. Update the current index state immediately
            currentIndex = targetActiveIndex;

            // 2. Ensure the target slide and its neighbors are rendered *before* scrolling.
            //    This might involve removing/adding slides.
            console.log("Updating rendered slides for jump...");
            await updateRenderedSlides(); // Wait for DOM changes
            console.log("Render update complete.");

            // 3. Find the target slide element *after* rendering is complete
            const targetSlideElement = videoContainer.querySelector(`.video-slide[data-index="${targetActiveIndex}"]`);

            if (targetSlideElement) {
                console.log("Scrolling to target slide...");
                // Use 'smooth' for a visual jump, 'auto' for instant.
                // 'center' block alignment often works well for jumps.
                targetSlideElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Wait for the smooth scroll animation to roughly complete
                // before releasing the jump lock and re-enabling controls.
                // This prevents the observer from immediately triggering on intermediate slides.
                 await new Promise(resolve => setTimeout(resolve, JUMP_SCROLL_DELAY_MS));

            } else {
                console.error(`Jump failed: Could not find slide element for active index ${targetActiveIndex} after rendering.`);
                alert(`跳转失败：无法找到目标视频元素。`);
                // Fallback: Scroll to top? Or just re-enable controls.
                videoContainer.scrollTop = 0; // Go to top as a fallback
            }
        } catch (error) {
             console.error("Error during jump:", error);
             alert("跳转过程中发生错误。");
        } finally {
             // 4. Always clear input and re-enable controls after jump attempt
             jumpInput.value = '';
             isJumping = false; // Release the jump lock
             jumpButton.disabled = false;
             jumpInput.disabled = false;
             console.log("Jump process finished.");
        }
    }

    // --- Initialization ---
    async function initialize() {
        try {
            // 1. Fetch and parse the video list
            const response = await fetch('index.txt');
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const text = await response.text();
            // Store the original order and filter out empty lines
            originalVideoUrls = text.split('\n').map(line => line.trim()).filter(line => line);

            if (originalVideoUrls.length === 0) throw new Error('index.txt is empty or contains no valid URLs.');
            console.log(`Loaded ${originalVideoUrls.length} video URLs.`);

            // 2. Create the URL to Original Index Map
            urlToOriginalIndexMap.clear();
            originalVideoUrls.forEach((url, index) => {
                // Only map the first occurrence if duplicates exist
                if (!urlToOriginalIndexMap.has(url)) {
                    urlToOriginalIndexMap.set(url, index); // Map URL -> 0-based original index
                } else {
                    console.warn(`Duplicate URL found at line ${index + 1}: ${url}. Mapping will point to the first occurrence.`);
                }
            });
            console.log("URL to original index map created.");

            // 3. Set up initial playback mode (Random by default)
            currentModeIsRandom = true;
            activeVideoUrls = shuffleArray(originalVideoUrls); // Shuffle initially
            toggleModeButton.textContent = '切换顺序'; // Set correct initial button text
            console.log("Initialized in Random mode.");

            // 4. Remove initial loading indicator
            if (initialLoadingIndicator) initialLoadingIndicator.remove();

            // 5. Configure jump input limits
            jumpInput.max = originalVideoUrls.length; // Set max based on loaded count
            jumpInput.min = 1; // Ensure min is 1

            // 6. Setup Intersection Observer (needs to exist before initial render)
            setupIntersectionObserver();

            // 7. Render the initial set of slides based on the (shuffled) active list
            await updateRenderedSlides();

            // 8. Add Event Listeners for UI controls
            toggleModeButton.addEventListener('click', handleToggleMode);
            jumpButton.addEventListener('click', handleJumpToVideo);
            // Allow jump on Enter key press in the input field
            jumpInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault(); // Prevent default form submission behavior
                    handleJumpToVideo();
                }
            });

            // 9. Preload neighbors of the initially visible video (index 0 of the active list)
            //    No explicit scroll needed, browser shows top by default.
             const firstSlide = videoContainer.querySelector('.video-slide[data-index="0"]');
             if (firstSlide) {
                 console.log("Preloading neighbors of initial video.");
                 preloadNeighborVideos(0);
             } else {
                 // This might happen if index.txt was valid but empty after filtering, or other errors.
                 console.warn("Could not find the initial slide (index 0) after initial render.");
                 if (activeVideoUrls.length > 0) {
                     // Should not happen if updateRenderedSlides worked correctly
                     console.error("Initialization state inconsistent: Videos loaded but first slide not found.");
                 } else {
                      // Display error if no videos ended up in the list
                      displaySlideError(videoContainer, "没有可显示的视频");
                 }
             }

        } catch (error) {
            console.error('Initialization failed:', error);
            // Display a prominent error message to the user
            const errorElement = document.createElement('div');
            errorElement.className = 'error-message';
            errorElement.textContent = `加载视频失败: ${error.message}. 请检查 index.txt 文件和网络连接。`;
            videoContainer.innerHTML = ''; // Clear container
            videoContainer.appendChild(errorElement);
            if (initialLoadingIndicator) initialLoadingIndicator.remove(); // Ensure loading is hidden
            // Disable controls if initialization failed
            controlsContainer.querySelectorAll('button, input').forEach(el => el.disabled = true);
        }
    }

    // --- Start the Application ---
    initialize();
});
