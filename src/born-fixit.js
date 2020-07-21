
export default class FixIt {
    constructor(options = {}) {
        this.options = options;

        this.shouldEnable = this.options.enabled || function() {return true;};
        // this.offset = isNaN(this.options.offset) ?  || 0;
        this.target = (typeof this.options.target === 'string' ? document.querySelector(this.options.target) : this.options.target) || false;
        this.offsetElements = false;

        if (this.options.offset && isNaN(this.options.offset)) {
            this.offsetElements = typeof this.options.offset === 'string' ? document.querySelectorAll(this.options.offset) : this.options.offset;
            this.offset = this.getOffsetValue();
        } else {
            this.offset = this.options.offset || 0;
        }

        //Milliseconds to wait after the last scroll happened.
        //A value between 75 and 300 is recommended to prevent miscalculations.
        this._scrollDirectionWait = this.options.scrollDirectionWait || 100;

        //Minimum distance to scroll within the "wait" period.
        this._scrollPositionThereshold = this.options.scrollPositionThereshold || 75;

        //Amount of times the scroll should fire before allowing to change the direction.
        //Setting this and `scrollPositionThereshold` to 0 makes the direction change happen on every scroll.
        this._scrollDirectionThrottle = this.options.scrollDirectionThrottle || 20;

        this._boundUpdateStickyStatus = this.updateStickyStatus.bind(this);
        this._boundEnableSticky = this.enableSticky.bind(this, 150);

        if (this.target) {
            this.enableSticky();

            window.addEventListener('resize', this._boundEnableSticky);
        }
    }

    enableSticky(timeOut) {
        window.clearTimeout(this._resizeTimeout);

        this._resizeTimeout = window.setTimeout(function() {
            this.offset = this.getOffsetValue();

            if (!this.isEnabled && this.shouldEnable()) {
                this.isEnabled = true;

                if (!this.placeholder) {
                    this.initialSetup();
                }

                this._updateInterval = window.setInterval(this._boundUpdateStickyStatus.bind(this, true), 100);
                window.addEventListener('scroll', this._boundUpdateStickyStatus);

                this._boundUpdateStickyStatus();
            }

            else if (this.isEnabled && !this.shouldEnable()) {
                this.isEnabled = false;

                this.setInactive();

                window.clearInterval(this._updateInterval);
                window.removeEventListener('scroll', this._boundUpdateStickyStatus);
            }
        }.bind(this), timeOut || 0);
    }

    /**
     * Resets the FixIt initialization and removes all classes and elements created by this FixIt instance.
     */
    destroySticky() {
        this.isEnabled = false;

        this.setInactive();
        this.removePlaceholder();

        window.clearTimeout(this._resizeTimeout);
        window.clearInterval(this._updateInterval);
        window.removeEventListener('resize', this._boundEnableSticky);
        window.removeEventListener('scroll', this._boundUpdateStickyStatus);
    }

    /**
     * Attempts to get the reference offset element's height, otherwise returns the current offset value or zero.
     * @return {[type]} [description]
     */
    getOffsetValue() {
        let resultSum = 0;

        if (this.offsetElements instanceof NodeList) {
            [].forEach.call(this.offsetElements, function(currentEl) {
                resultSum += Math.round(currentEl.getBoundingClientRect().height);
            });
        } else {
            resultSum = this.offset || 0;
        }

        return resultSum;
    }

    //Initial FixIt setup. Should only run once to avoid attaching repeated event handlers.
    initialSetup() {
        this.setPlaceholder();

        this.parentContainer = this.options.containedInParent ? (this.options.containedInParent instanceof HTMLElement ? this.options.containedInParent : this.target.parentNode) : false;

        if (this.options.respondToParent) {
            this.target.classList.add('fixit--respond-to-parent');
            this.options.respondToParent = this.options.respondToParent instanceof HTMLElement ? this.options.respondToParent : this.parentContainer;

            window.addEventListener('resize', this.respondTo.bind(this));
            this.target.addEventListener('fixit:triggerResize', this.respondTo.bind(this));
        }

        this.scrollPosition = 0;

        this.publishEvent('fixit', 'init', this.target);

        if (typeof this.options.onInitCallback === 'function') {
            this.options.onInitCallback(this.target, this);
        }

        this.target.addEventListener('fixit:updateScrollDirection', function(evt) {
            this.updateScrollDirection(evt.detail.scrollDirection);
        }.bind(this));
    }

    /**
     * Updates the status of the sticky object according to where it is on the current scroll.
     */
    updateStickyStatus(isAutoUpdate) {
        //isAutoUpdate could be passed as an event instead, so make sure it's an intentional boolean.
        isAutoUpdate = typeof isAutoUpdate === 'boolean' ? isAutoUpdate : false;

        //Indicates if the FixIt element has changed positions and prevents making unnecessary recalculations.
        //Useful for when something changes on the page (like toggling content) that would push the FixIt element off (typically when it's resting and `this.isFrozen` is true).
        if (!isAutoUpdate || (isAutoUpdate && this._previousDocumentHeight !== this.getDocumentHeight())) {
            let targetHeight = this.getTargetHeight(),
                canContainInParent = !this.parentContainer || (targetHeight < this.parentContainer.getBoundingClientRect().height);

            this._placeholderRect = this.placeholder.getBoundingClientRect();

            //canContainInParent if target is smaller than its parent
            //Make sure the entirety of the target element is visible on screen before applying the fixed status.
            if (canContainInParent && this._placeholderRect.top < this.offset) {
                let scrollDirection = this.getScrollDirection();

                this._previousDocumentHeight = this.getDocumentHeight();

                if (this._placeholderRect.top + targetHeight < this.offset) {
                    this.setFullyScrolled();
                }

                //Only request to change the direction if this flag is turn on.
                //This prevents potentially taxing calculations.
                if (this.options.enableDirectionUpdates) {
                    this.requestScrollDirectionUpdate(scrollDirection);
                }

                if( !this.targetIsTall() ) {
                    if(!this.isActive) {
                        this.setActive();
                    }
                } else {
                    let targetRect = this.target.getBoundingClientRect();

                    if ( scrollDirection === 'down' ) {
                        if (Math.round(targetRect.bottom) <= Math.max(window.innerHeight, document.documentElement.clientHeight)) {
                            if(!this.isActive) {
                                this.isFrozen = false;
                                this.setActive(true);
                            }
                        } else if (this.isActive && !this.isDocked && !this.shouldDock(targetRect)) {
                            //We don't wanna run this if it's docked
                            this.isActive = false;
                            this.setFrozen();
                        }
                    } else {
                        if (Math.round(targetRect.top) >= this.offset) {
                            if(!this.isActive) {
                                this.isFrozen = false;
                                this.setActive();
                            }
                        } else if (this.isActive && !this.isDocked && !this.shouldDock(targetRect)) {
                            //We don't wanna run this if it's docked
                            this.isActive = false;
                            this.setFrozen();
                        }
                    }
                }

                this.containInParent();
            } else if(this.isActive) {
                this.setInactive();
            }
        }

        return this.isActive || this.isFrozen;
    }

    getDocumentHeight() {
        return Math.max(document.body.scrollHeight, document.body.offsetHeight, document.documentElement.clientHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight);
    }

    /**
     * Constrains the target element's scroll to the inside of a defined parent [parentContainer] element.
     */
    containInParent() {
        if (this.parentContainer && this.isActive) {
            let targetRect = this.target.getBoundingClientRect();

            //Make sure bottom of parent is visible, then ensure the target and the parent's bottom are at the same level, then confirm the window's offset is not over the target
            if (this.shouldDock(targetRect)) {
                this.setDocked();
            } else if(this.isDocked && targetRect.top >= this.offset) {
                this.setUndocked();
            }
        }
    }

    shouldDock(targetRect) {
        let parentBottom = this.parentContainer.getBoundingClientRect().bottom;

        return parentBottom <= document.documentElement.clientHeight && targetRect.bottom >= parentBottom && targetRect.top <= this.offset;
    }

    setDocked() {
        this.isDocked = true;
        this.target.classList.add('fixit--docked');
        this.target.classList.remove('fixit--bottom');
        this.setTargetPos(true);
    }

    setUndocked() {
        this.isDocked = false;
        this.target.classList.remove('fixit--docked');
        this.setTargetPos();
    }

    /**
     * Either sets the target's 'top' property to the offset value, or clears it depending on [reset] value. 
     * @param  {[boolean]} reset 
     */
    setTargetPos(reset) {
        let newPos = '';

        if (!reset && this.options.useOffsetOnTarget) {
            newPos = this.offset + 'px';
        }

        this.target.style.top = newPos;
    }

    /**
     * Adapts target's width according to its parent's width. Needed cause fixed elements respond to the window.
     */
    respondTo() {
        if (this.isActive || this.isFrozen) {
            let parentComputedStyle = window.getComputedStyle(this.options.respondToParent),
                parentWidth = this.options.respondToParent.getBoundingClientRect().width - parseFloat(parentComputedStyle['padding-left']) - parseFloat(parentComputedStyle['padding-right']);

            this.target.style.width = parentWidth + 'px';
        }
    }


    /**
     * Freezes the target at its current position relative to its parent.
     */
    setFrozen() {
        this.isFrozen = true;
        this.target.style.top = Math.abs(this.parentContainer.getBoundingClientRect().top - this.target.getBoundingClientRect().top) + 'px';
        this.target.classList.remove('fixit--bottom');
        this.target.classList.remove('fixit--active');
        this.target.classList.add('fixit--frozen');
    }

    /**
     * If 'toBottom' is set to true, the fixed element is attached to the bottom of its container.
     * @param {[type]} toBottom [description]
     */
    setActive(toBottom) {
        this.isActive = true;
        this.setPlaceholderProps(true);
        this.target.classList.remove('fixit--frozen');
        this.target.classList.add('fixit--active');

        if (toBottom) {
            this.target.classList.add('fixit--bottom');
            this.setTargetPos(true);
        } else {
            this.setTargetPos();
        }

        if (this.options.respondToParent) {
            this.respondTo();
        }

        this.publishEvent('fixit', 'active', this.target);

        if (typeof this.options.onActiveCallback === 'function') {
            this.options.onActiveCallback(this.target, this);
        }
    }

    //Removes all statuses/settings from the fixit object
    setInactive() {
        this.isActive = false;

        this.setPlaceholderProps();
        this.target.classList.remove('fixit--active');
        this.target.classList.remove('fixit--bottom');
        this.target.classList.remove('fixit--docked');
        this.target.classList.remove('fixit--frozen');

        this.target.classList.remove('fixit--scrolled');

        this.removeDirectionUpdates();

        this.scrollPosition = 0;

        if (this.options.useOffsetOnTarget) {
            this.setTargetPos(true);
        }

        if (this.options.respondToParent) {
            this.target.style.width = '';
        }

        this.publishEvent('fixit', 'inactive', this.target);

        if (typeof this.options.onInactiveCallback === 'function') {
            this.options.onInactiveCallback(this.target, this);
        }
    }

    removeDirectionUpdates() {
        if (this.options.enableDirectionUpdates) {
            this.target.classList.remove('fixit--scroll-up');
            this.target.classList.remove('fixit--scroll-down');
            this.target.classList.remove('fixit--scroll-direction-change');

            delete this._prevScrollDirection;

            window.clearTimeout(this._scrollDirectionTimeout);
        }
    }

    /**
     * Creates a "placeholder" element that will take the height (including padding) and margin properties of
     * the target element and is used to avoid a jump when scrolling down and activating the 'fixed' status
     */
    setPlaceholder() {
        let target = this.target;

        this.placeholder = document.createElement('div');

        this.placeholder.className = 'fixit-placeholder';

        target.parentNode.insertBefore(this.placeholder, target);
    }

    /*
    * Removes the placeholder element.
     */
    removePlaceholder() {
        this.placeholder.parentNode.removeChild(this.placeholder);
    }

    /**
     * Updates placeholder properties
     * @param {[boolean]} sync [either sets or resets values]
     */
    setPlaceholderProps(sync) {
        if (this.placeholder) {
            if(sync) {
                this.placeholder.style.height = this.getTargetHeight() + 'px';
                this.placeholder.style.margin = window.getComputedStyle(this.target).margin;
            } else {
                this.placeholder.style.height = '';
                this.placeholder.style.margin = '';
            }
        }
    }

    targetIsTall() {
        return (this.getTargetHeight() + this.offset) > document.documentElement.clientHeight;
    }

    getTargetHeight() {
        return this.target.getBoundingClientRect().height;
    }

    //This method needs revision:
    //Position is not properly reported on certain browsers when using window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
    getScrollDirection() {
        let direction,
            docScrollTop = this._placeholderRect.top;

        //Do not set a direction if there is no difference between these two values.
        if (this.scrollPosition > docScrollTop) {
            direction = 'down';
        } else if (this.scrollPosition < docScrollTop) {
            direction = 'up';
        }

        this.scrollPosition = docScrollTop;

        return direction;
    }

    /**
     * Attempts to update the scroll direction, but only if all the configured options are met.
     * @param  {String} newScrollDirection ["up" or "down"]
     */
    requestScrollDirectionUpdate(newScrollDirection) {
        this._setScrollDirectionCallCount = (this._setScrollDirectionCallCount || 0) + 1;
        this._newScrollPosition = this._placeholderRect.top;

        //Throttle how often the scroll direction change should be called.
        //This allows updating the direction even before the user has stopped scrolling.
        if (this._setScrollDirectionCallCount >= this._scrollDirectionThrottle) {
            this._updateScrollDirectionOnThreshold(newScrollDirection);

            //Reset the call count once it has reached the minimum threshold.
            this._setScrollDirectionCallCount = 0;
        }

        window.clearTimeout(this._scrollDirectionTimeout);

        //Set a timeout to ensure that the last position is stored after the user stops scrolling.
        this._scrollDirectionTimeout = window.setTimeout(function() {
            this._updateScrollDirectionOnThreshold(newScrollDirection);

            this._prevScrollPosition = this._placeholderRect.top;
        }.bind(this), this._scrollDirectionWait);
    }

    /**
     * Internal function to ensure the scroll position difference between the last two locations is larger than the configured threshold.
     * @param  {String} newScrollDirection ["up" or "down"]
     */
    _updateScrollDirectionOnThreshold(newScrollDirection) {
        //Scroll position difference between the new location and the
        //location the FixIt target had the last time a "direction change" was succesfully executed.
        this._diffScrollPosition = Math.abs(this._newScrollPosition - (this._prevScrollPosition || 0));

        if (this._diffScrollPosition > this._scrollPositionThereshold) {
            this.updateScrollDirection(newScrollDirection);
        }
    }

    /**
     * Update the FixIt target state with the provided `newScrollDirection` value.
     * @param  {String} newScrollDirection ["up" or "down"]
     */
    updateScrollDirection(newScrollDirection) {
        if (this._prevScrollDirection !== newScrollDirection) {
            this.target.classList.add(`fixit--scroll-${newScrollDirection}`);
            this.target.classList.remove(`fixit--scroll-${this._prevScrollDirection}`);

            //Attach a special class when the direction has changed at least once.
            //We know this happens whenever a `this._prevScrollDirection` is available.
            if (this._prevScrollDirection) {
                this.target.classList.add('fixit--scroll-direction-change');
            }

            this.publishEvent('fixit', 'scrollDirectionChange', this.target, {
                previousDirection: this._prevScrollDirection,
                newDirection: newScrollDirection
            });

            this._prevScrollDirection = newScrollDirection;
            this._prevScrollPosition = this._placeholderRect.top;
        }
    }

    setFullyScrolled() {
        if (!this.target.classList.contains('fixit--scrolled')) {
            this.target.classList.add('fixit--scrolled')
        }
    }

    /**
     * Publish an event at the specific target element scope
     * for other modules to subscribe.
     * The subscribe method can be a standard
     * .addEventListener('moduleName.eventName') method
     *
     * @param {String} moduleName
     * @param {String} eventName
     * @param {HTMLElement} target
     */
    publishEvent(moduleName, eventName, target, detail) {
        let event,
            params = { bubbles: true, cancelable: true, detail },
            eventString = moduleName && eventName ? `${moduleName}:${eventName}` : (moduleName || eventName);

        // IE >= 9, CustomEvent() constructor does not exist
        if (typeof window.CustomEvent !== 'function') {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent(eventString, params.bubbles, params.cancelable, null);
        } else {
            event = new CustomEvent(eventString, params);
        }

        target.dispatchEvent(event);
    }
}
