Ext.define('PVE.panel.SubConfig', {
    extend: 'Ext.tab.Panel',
    alias: ['widget.pvePanelSubConfig'],

    configPrefix: undefined,
    tabPosition: 'left',
    tabRotation: 0,
    savedTab: undefined,

    getHState: function(itemId) {
	 /*jslint confusion: true */
        var me = this;

	if (!itemId) {
	    if (me.getActiveTab() === undefined) {
		me.setActiveTab(0);
	    }
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
		me.activeTab = res[2]; // if we have lazy items, this does nothing
		me.savedTab = res[2]; // so we save it here
	    }
	}

	Ext.apply(me, {
	    listeners: {
		afterrender: function(tp) {
		    // if we have lazy items,
		    // we saved the tabname in savedTab
		    if (me.activeTab === undefined && me.savedTab) {
			me.setActiveTab(me.savedTab);
		    } else if (me.activeTab === undefined) {
			// if we have nothing else, we set 0 as active
			me.setActiveTab(0);
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
