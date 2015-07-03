Ext.define('PVE.panel.SubConfig', {
    extend: 'Ext.tab.Panel',
    alias: ['widget.pvePanelSubConfig'],

    configPrefix: undefined,

    getHState: function(itemId) {
	 /*jslint confusion: true */
        var me = this;
	
	if (!itemId) {
	    itemId = me.getActiveTab().itemId;
	}

	var first =  me.items.get(0);
	var ntab;

	// Note: '' is alias for first tab.
	if (itemId === first.itemId) {
	    ntab = me.configPrefix;
	} else {
	    ntab = me.configPrefix + '-' + itemId;
	}

	return { value: ntab };
    },

    initComponent: function() {
        var me = this;

	if (!me.phstateid) {
	    throw "no parent history state specified";
	}

	var sp = Ext.state.Manager.getProvider();
	var state = sp.get(me.phstateid);
	
	var hsregex =  /^([^\-\s]+)-(\S+)?$/;

	if (state && state.value) {
	    var res = hsregex.exec(state.value);
	    if (res && res[1] && res[2] && res[1] === me.configPrefix) {
		me.activeTab = res[2];
	    }
	}

	Ext.apply(me, {
	    plain: true,
	    tabPosition: 'bottom',
	    listeners: {
		afterrender: function(tp) {
		    var first =  tp.items.get(0);
		    if (first) {
			first.fireEvent('show', first);
		    }
		},
		tabchange: function(tp, newcard, oldcard) {
		    var state = me.getHState(newcard.itemId);
		    sp.set(me.phstateid, state);
		}
	    }
	});

	me.callParent();

	var statechange = function(sp, key, state) {
	    if ((key === me.phstateid) && state) {
		var first = me.items.get(0);
		var atab = me.getActiveTab().itemId;
		var res = hsregex.exec(state.value);
		var ntab = (res && res[1]) ? res[1] : first.itemId;
		if (ntab && (atab != ntab)) {
		    me.setActiveTab(ntab);
		}
	    }
	};

	me.mon(sp, 'statechange', statechange);
    }
});
