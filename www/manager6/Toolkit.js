// ExtJS related things

PVE.Utils.toolkit = 'extjs';

 // do not send '_dc' parameter
Ext.Ajax.disableCaching = false;

// custom Vtypes
Ext.apply(Ext.form.field.VTypes, {
    IPAddress:  function(v) {
	return PVE.Utils.IP4_match.test(v);
    },
    IPAddressText:  gettext('Example') + ': 192.168.1.1',
    IPAddressMask: /[\d\.]/i,

    IPCIDRAddress:  function(v) {
	var result = PVE.Utils.IP4_cidr_match.exec(v);
	// limits according to JSON Schema see
	// pve-common/src/PVE/JSONSchema.pm
	return (result !== null && result[1] >= 8 && result[1] <= 32);
    },
    IPCIDRAddressText:  gettext('Example') + ': 192.168.1.1/24' + "<br>" + gettext('Valid CIDR Range') + ': 8-32',
    IPCIDRAddressMask: /[\d\.\/]/i,

    IP6Address:  function(v) {
        return PVE.Utils.IP6_match.test(v);
    },
    IP6AddressText:  gettext('Example') + ': 2001:DB8::42',
    IP6AddressMask: /[A-Fa-f0-9:]/,

    IP6CIDRAddress:  function(v) {
	var result = PVE.Utils.IP6_cidr_match.exec(v);
	// limits according to JSON Schema see
	// pve-common/src/PVE/JSONSchema.pm
	return (result !== null && result[1] >= 8 && result[1] <= 120);
    },
    IP6CIDRAddressText:  gettext('Example') + ': 2001:DB8::42/64' + "<br>" + gettext('Valid CIDR Range') + ': 8-120',
    IP6CIDRAddressMask:  /[A-Fa-f0-9:\/]/,

    IP6PrefixLength:  function(v) {
	return v >= 0 && v <= 128;
    },
    IP6PrefixLengthText:  gettext('Example') + ': X, where 0 <= X <= 128',
    IP6PrefixLengthMask:  /[0-9]/,

    IP64Address:  function(v) {
        return PVE.Utils.IP64_match.test(v);
    },
    IP64AddressText:  gettext('Example') + ': 192.168.1.1 2001:DB8::42',
    IP64AddressMask: /[A-Fa-f0-9\.:]/,

    MacAddress: function(v) {
	return (/^([a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/).test(v);
    },
    MacAddressMask: /[a-fA-F0-9:]/,
    MacAddressText: gettext('Example') + ': 01:23:45:67:89:ab',

    BridgeName: function(v) {
        return (/^vmbr\d{1,4}$/).test(v);
    },
    BridgeNameText: gettext('Format') + ': vmbr<b>N</b>, where 0 <= <b>N</b> <= 9999',

    BondName: function(v) {
        return (/^bond\d{1,4}$/).test(v);
    },
    BondNameText: gettext('Format') + ': bond<b>N</b>, where 0 <= <b>N</b> <= 9999',

    InterfaceName: function(v) {
        return (/^[a-z][a-z0-9_]{1,20}$/).test(v);
    },
    InterfaceNameText: gettext("Allowed characters") + ": 'a-z', '0-9', '_'" + "<br />" +
		       gettext("Minimum characters") + ": 2" + "<br />" +
		       gettext("Maximum characters") + ": 21" + "<br />" +
		       gettext("Must start with") + ": 'a-z'",

    QemuStartDate: function(v) {
	return (/^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/).test(v);
    },
    QemuStartDateText: gettext('Format') + ': "now" or "2006-06-17T16:01:21" or "2006-06-17"',

    StorageId:  function(v) {
        return (/^[a-z][a-z0-9\-\_\.]*[a-z0-9]$/i).test(v);
    },
    StorageIdText: gettext("Allowed characters") + ":  'A-Z', 'a-z', '0-9', '-', '_', '.'" + "<br />" +
		   gettext("Minimum characters") + ": 2" + "<br />" +
		   gettext("Must start with") + ": 'A-Z', 'a-z'<br />" +
		   gettext("Must end with") + ": 'A-Z', 'a-z', '0-9'<br />",

    ConfigId:  function(v) {
        return (/^[a-z][a-z0-9\_]+$/i).test(v);
    },
    ConfigIdText: gettext("Allowed characters") + ": 'A-Z', 'a-z', '0-9', '_'" + "<br />" +
		  gettext("Minimum characters") + ": 2" + "<br />" +
		  gettext("Must start with") + ": " + gettext("letter"),

    HttpProxy:  function(v) {
        return (/^http:\/\/.*$/).test(v);
    },
    HttpProxyText: gettext('Example') + ": http://username:password&#64;host:port/",

    DnsName: function(v) {
	return PVE.Utils.DnsName_match.test(v);
    },
    DnsNameText: gettext('This is not a valid DNS name'),

    // workaround for https://www.sencha.com/forum/showthread.php?302150
    pveMail: function(v) {
        return (/^(\w+)([\-+.][\w]+)*@(\w[\-\w]*\.){1,5}([A-Za-z]){2,63}$/).test(v);
    },
    pveMailText: gettext('Example') + ": user@example.com",

    HostList: function(v) {
	var list = v.split(/[\ \,\;]+/);
	var i;
	for (i = 0; i < list.length; i++) {
	    if (list[i] == "") {
		continue;
	    }

	    if (!PVE.Utils.HostPort_match.test(list[i]) &&
		!PVE.Utils.HostPortBrackets_match.test(list[i]) &&
		!PVE.Utils.IP6_dotnotation_match.test(list[i])) {
		return false;
	    }
	}

	return true;
    },
    HostListText: gettext('Not a valid list of hosts')
});

// since we always want the number in
// x.y format and never in e.g. x,y
Ext.define('PVE.form.field.Number', {
    override: 'Ext.form.field.Number',
    submitLocaleSeparator: false
});

// ExtJs 5-6 has an issue with caching
// see https://www.sencha.com/forum/showthread.php?308989
Ext.define('PVE.UnderlayPool', {
    override: 'Ext.dom.UnderlayPool',

    checkOut: function () {
        var cache = this.cache,
            len = cache.length,
            el;

        // do cleanup because some of the objects might have been destroyed
	while (len--) {
            if (cache[len].destroyed) {
                cache.splice(len, 1);
            }
        }
        // end do cleanup

	el = cache.shift();

        if (!el) {
            el = Ext.Element.create(this.elementConfig);
            el.setVisibilityMode(2);
            //<debug>
            // tell the spec runner to ignore this element when checking if the dom is clean
	    el.dom.setAttribute('data-sticky', true);
            //</debug>
	}

        return el;
    }
});

// 'Enter' in Textareas and aria multiline fields should not activate the
// defaultbutton, fixed in extjs 6.0.2
Ext.define('PVE.panel.Panel', {
    override: 'Ext.panel.Panel',

    fireDefaultButton: function(e) {
	if (e.target.getAttribute('aria-multiline') === 'true' ||
	    e.target.tagName === "TEXTAREA") {
	    return true;
	}
	return this.callParent(arguments);
    }
});

// if the order of the values are not the same in originalValue and value
// extjs will not overwrite value, but marks the field dirty and thus
// the reset button will be enabled (but clicking it changes nothing)
// so if the arrays are not the same after resetting, we
// clear and set it
Ext.define('PVE.form.ComboBox', {
    override: 'Ext.form.field.ComboBox',

    reset: function() {
	// copied from combobox
	var me = this;
	me.callParent();

	// clear and set when not the same
	var value = me.getValue();
	if (Ext.isArray(me.originalValue) && Ext.isArray(value) && !Ext.Array.equals(value, me.originalValue)) {
	    me.clearValue();
	    me.setValue(me.originalValue);
	}
    }
});

// when refreshing the view of a grid/tree
// the restoring of the focus brings the
// focused item back in the view, even when we scrolled away
Ext.define(null, {
    override: 'Ext.view.Table',

    jumpToFocus: false,

    saveFocusState: function() {
        var me = this,
            store = me.dataSource,
            actionableMode = me.actionableMode,
            navModel = me.getNavigationModel(),
            focusPosition = actionableMode ? me.actionPosition : navModel.getPosition(true),
            refocusRow, refocusCol;

        if (focusPosition) {
            // Separate this from the instance that the nav model is using.
            focusPosition = focusPosition.clone();

            // Exit actionable mode.
            // We must inform any Actionables that they must relinquish control.
            // Tabbability must be reset.
            if (actionableMode) {
                me.ownerGrid.setActionableMode(false);
            }

            // Blur the focused descendant, but do not trigger focusLeave.
            me.el.dom.focus();

            // Exiting actionable mode navigates to the owning cell, so in either focus mode we must
            // clear the navigation position
            navModel.setPosition();

            // The following function will attempt to refocus back in the same mode to the same cell
            // as it was at before based upon the previous record (if it's still inthe store), or the row index.
            return function() {
                // If we still have data, attempt to refocus in the same mode.
                if (store.getCount()) {

                    // Adjust expectations of where we are able to refocus according to what kind of destruction
                    // might have been wrought on this view's DOM during focus save.
                    refocusRow = Math.min(focusPosition.rowIdx, me.all.getCount() - 1);
                    refocusCol = Math.min(focusPosition.colIdx, me.getVisibleColumnManager().getColumns().length - 1);
                    focusPosition = new Ext.grid.CellContext(me).setPosition(
                            store.contains(focusPosition.record) ? focusPosition.record : refocusRow, refocusCol);

                    if (actionableMode) {
                        me.ownerGrid.setActionableMode(true, focusPosition);
                    } else {
                        me.cellFocused = true;

			// we sometimes want to scroll back to where we were
			var x = me.getScrollX();
			var y = me.getScrollY();

                        // Pass "preventNavigation" as true so that that does not cause selection.
                        navModel.setPosition(focusPosition, null, null, null, true);

			if (!me.jumpToFocus) {
			    me.scrollTo(x,y);
			}
                    }
                }
                // No rows - focus associated column header
                else {
                    focusPosition.column.focus();
                }
            };
        }
        return Ext.emptyFn;
    }
});

// should be fixed with ExtJS 6.0.2, see:
// https://www.sencha.com/forum/showthread.php?307244-Bug-with-datefield-in-window-with-scroll
Ext.define('PVE.Datepicker', {
    override: 'Ext.picker.Date',
    hideMode: 'visibility'
});

// this should be fixed with ExtJS 6.0.2
// this makes mousescrolling work in firefox in the overflowhandler
// and does not change behaviour in any other browser
Ext.define(null, {
    override: 'Ext.layout.container.boxOverflow.Scroller',

    createWheelListener: function() {
	var me = this;
	if (Ext.isFirefox) {
	    me.wheelListener = me.layout.innerCt.on('wheel', me.onMouseWheelFirefox, me, {destroyable: true});
	} else {
	    me.wheelListener = me.layout.innerCt.on('mousewheel', me.onMouseWheel, me, {destroyable: true});
	}
    },

    // special wheel handler for firefox
    // nearly the same as the default onMouseWheel handler,
    // but using deltaY instead of wheelDeltaY
    // and no normalizing, because it is already normalized
    onMouseWheelFirefox: function(e) {
	e.stopEvent();
	var delta = e.browserEvent.deltaY || 0;
	this.scrollBy(delta * this.wheelIncrement, false);
    }

});

// force alert boxes to be rendered with an Error Icon
// since Ext.Msg is an object and not a prototype, we need to override it
// after the framework has been initiated
Ext.onReady(function() {
/*jslint confusion: true */
    Ext.override(Ext.Msg, {
	alert: function(title, message, fn, scope) {
	    if (Ext.isString(title)) {
		var config = {
		    title: title,
		    message: message,
		    icon: this.ERROR,
		    buttons: this.OK,
		    fn: fn,
		    scope : scope,
		    minWidth: this.minWidth
		};
	    return this.show(config);
	    }
	}
    });
/*jslint confusion: false */
});
Ext.define('Ext.ux.IFrame', {
    extend: 'Ext.Component',

    alias: 'widget.uxiframe',

    loadMask: 'Loading...',

    src: 'about:blank',

    renderTpl: [
        '<iframe src="{src}" id="{id}-iframeEl" data-ref="iframeEl" name="{frameName}" width="100%" height="100%" frameborder="0" allowfullscreen="true"></iframe>'
    ],
    childEls: ['iframeEl'],

    initComponent: function () {
        this.callParent();

        this.frameName = this.frameName || this.id + '-frame';
    },

    initEvents : function() {
        var me = this;
        me.callParent();
        me.iframeEl.on('load', me.onLoad, me);
    },

    initRenderData: function() {
        return Ext.apply(this.callParent(), {
            src: this.src,
            frameName: this.frameName
        });
    },

    getBody: function() {
        var doc = this.getDoc();
        return doc.body || doc.documentElement;
    },

    getDoc: function() {
        try {
            return this.getWin().document;
        } catch (ex) {
            return null;
        }
    },

    getWin: function() {
        var me = this,
            name = me.frameName,
            win = Ext.isIE
                ? me.iframeEl.dom.contentWindow
                : window.frames[name];
        return win;
    },

    getFrame: function() {
        var me = this;
        return me.iframeEl.dom;
    },

    beforeDestroy: function () {
        this.cleanupListeners(true);
        this.callParent();
    },

    cleanupListeners: function(destroying){
        var doc, prop;

        if (this.rendered) {
            try {
                doc = this.getDoc();
                if (doc) {
		    /*jslint nomen: true*/
                    Ext.get(doc).un(this._docListeners);
		    /*jslint nomen: false*/
                    if (destroying && doc.hasOwnProperty) {
                        for (prop in doc) {
                            if (doc.hasOwnProperty(prop)) {
                                delete doc[prop];
                            }
                        }
                    }
                }
            } catch(e) { }
        }
    },

    onLoad: function() {
        var me = this,
            doc = me.getDoc(),
            fn = me.onRelayedEvent;

        if (doc) {
            try {
                // These events need to be relayed from the inner document (where they stop
                // bubbling) up to the outer document. This has to be done at the DOM level so
                // the event reaches listeners on elements like the document body. The effected
                // mechanisms that depend on this bubbling behavior are listed to the right
                // of the event.
		/*jslint nomen: true*/
                Ext.get(doc).on(
                    me._docListeners = {
                        mousedown: fn, // menu dismisal (MenuManager) and Window onMouseDown (toFront)
                        mousemove: fn, // window resize drag detection
                        mouseup: fn,   // window resize termination
                        click: fn,     // not sure, but just to be safe
                        dblclick: fn,  // not sure again
                        scope: me
                    }
                );
		/*jslint nomen: false*/
            } catch(e) {
                // cannot do this xss
            }

            // We need to be sure we remove all our events from the iframe on unload or we're going to LEAK!
            Ext.get(this.getWin()).on('beforeunload', me.cleanupListeners, me);

            this.el.unmask();
            this.fireEvent('load', this);

        } else if (me.src) {

            this.el.unmask();
            this.fireEvent('error', this);
        }


    },

    onRelayedEvent: function (event) {
        // relay event from the iframe's document to the document that owns the iframe...

        var iframeEl = this.iframeEl,

            // Get the left-based iframe position
            iframeXY = iframeEl.getTrueXY(),
            originalEventXY = event.getXY(),

            // Get the left-based XY position.
            // This is because the consumer of the injected event will
            // perform its own RTL normalization.
            eventXY = event.getTrueXY();

        // the event from the inner document has XY relative to that document's origin,
        // so adjust it to use the origin of the iframe in the outer document:
        event.xy = [iframeXY[0] + eventXY[0], iframeXY[1] + eventXY[1]];

        event.injectEvent(iframeEl); // blame the iframe for the event...

        event.xy = originalEventXY; // restore the original XY (just for safety)
    },

    load: function (src) {
        var me = this,
            text = me.loadMask,
            frame = me.getFrame();

        if (me.fireEvent('beforeload', me, src) !== false) {
            if (text && me.el) {
                me.el.mask(text);
            }

            frame.src = me.src = (src || me.src);
        }
    }
});
