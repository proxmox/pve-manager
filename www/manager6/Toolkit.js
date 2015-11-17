// ExtJS related things

PVE.Utils.toolkit = 'extjs',

 // do not send '_dc' parameter
Ext.Ajax.disableCaching = false;

// custom Vtypes
Ext.apply(Ext.form.field.VTypes, {
    IPAddress:  function(v) {
	return IP4_match.test(v);
    },
    IPAddressText:  gettext('Example') + ': 192.168.1.1',
    IPAddressMask: /[\d\.]/i,

    IPCIDRAddress:  function(v) {
	return IP4_cidr_match.test(v);
    },
    IPCIDRAddressText:  gettext('Example') + ': 192.168.1.1/24',
    IPCIDRAddressMask: /[\d\.\/]/i,

    IP6Address:  function(v) {
        return IP6_match.test(v);
    },
    IP6AddressText:  gettext('Example') + ': 2001:DB8::42',
    IP6AddressMask: /[A-Fa-f0-9:]/,

    IP6CIDRAddress:  function(v) {
	return IP6_cidr_match.test(v);
    },
    IP6CIDRAddressText:  gettext('Example') + ': 2001:DB8::42/64',
    IP6CIDRAddressMask:  /[A-Fa-f0-9:\/]/,

    IP6PrefixLength:  function(v) {
	return v >= 0 && v <= 128;
    },
    IP6PrefixLengthText:  gettext('Example') + ': X, where 0 <= X <= 128',
    IP6PrefixLengthMask:  /[0-9]/,
    
    IP64Address:  function(v) {
        return IP64_match.test(v);
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
    InterfaceNameText: gettext('Format') + ': [a-z][a-z0-9_]{1,20}',


    QemuStartDate: function(v) {
	return (/^(now|\d{4}-\d{1,2}-\d{1,2}(T\d{1,2}:\d{1,2}:\d{1,2})?)$/).test(v);
    },
    QemuStartDateText: gettext('Format') + ': "now" or "2006-06-17T16:01:21" or "2006-06-17"',

    StorageId:  function(v) {
        return (/^[a-z][a-z0-9\-\_\.]*[a-z0-9]$/i).test(v);
    },
    StorageIdText: gettext("Allowed characters") + ":  'A-Z', 'a-z', '0-9', '-', '_', '.'",

    ConfigId:  function(v) {
        return (/^[a-z][a-z0-9\_]+$/i).test(v);
    },
    ConfigIdText: gettext("Allowed characters") + ": 'A-Z', 'a-z', '0-9', '_'",

    HttpProxy:  function(v) {
        return (/^http:\/\/.*$/).test(v);
    },
    HttpProxyText: gettext('Example') + ": http://username:password&#64;host:port/",

    DnsName: function(v) {
	return (/^(([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)\.)*([A-Za-z0-9]([A-Za-z0-9\-]*[A-Za-z0-9])?)$/).test(v);
    },
    DnsNameText: gettext('This is not a valid DNS name'),

    // workaround for https://www.sencha.com/forum/showthread.php?302150
    pveMail: function(v) {
        return (/^(\w+)([\-+.][\w]+)*@(\w[\-\w]*\.){1,5}([A-Za-z]){2,63}$/).test(v);
    },
    pveMailText: gettext('This field should be an e-mail address in the format "user@example.com"'),
});

// we dont want that a displayfield set the form dirty flag! 
Ext.override(Ext.form.field.Display, {
    isDirty: function() { return false; }
});

// hack: ExtJS does not display the correct value if we
// call setValue while the store is loading, so we need
// to call it again after loading
Ext.override(Ext.form.field.ComboBox, {
    onLoad: function() {
	this.setValue(this.value, false);
        this.callOverridden(arguments);
    }
});

Ext.define('Ext.ux.IFrame', {
    extend: 'Ext.Component',

    alias: 'widget.uxiframe',

    loadMask: 'Loading...',

    src: 'about:blank',

    renderTpl: [
        '<iframe src="{src}" name="{frameName}" width="100%" height="100%" frameborder="0"></iframe>'
    ],

    initComponent: function () {
        this.callParent();

       this.frameName = this.frameName || this.id + '-frame';

        this.addEvents(
            'beforeload',
            'load'
        );

        Ext.apply(this.renderSelectors, {
            iframeEl: 'iframe'
        });
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
                    Ext.EventManager.removeAll(doc);
                    if (destroying) {
                        for (prop in doc) {
                            if (doc.hasOwnProperty && doc.hasOwnProperty(prop)) {
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
                Ext.EventManager.removeAll(doc);

                // These events need to be relayed from the inner document (where they stop
                // bubbling) up to the outer document. This has to be done at the DOM level so
                // the event reaches listeners on elements like the document body. The effected
                // mechanisms that depend on this bubbling behavior are listed to the right
                // of the event.
                Ext.EventManager.on(doc, {
                    mousedown: fn, // menu dismisal (MenuManager) and Window onMouseDown (toFront)
                    mousemove: fn, // window resize drag detection
                    mouseup: fn,   // window resize termination
                    click: fn,     // not sure, but just to be safe
                    dblclick: fn,  // not sure again
                    scope: me
                });
            } catch(e) {
                // cannot do this xss
            }

            // We need to be sure we remove all our events from the iframe on unload or we're going to LEAK!
            Ext.EventManager.on(this.getWin(), 'beforeunload', me.cleanupListeners, me);

            this.el.unmask();
            this.fireEvent('load', this);

        } else if(me.src && me.src != '') {

            this.el.unmask();
            this.fireEvent('error', this);
        }


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
