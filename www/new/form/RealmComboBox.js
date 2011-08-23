Ext.define('PVE.form.RealmComboBox', {
    extend: 'Ext.form.ComboBox',
    requires: ['Ext.data.Store', 'PVE.RestProxy'],
    alias: ['widget.pveRealmComboBox'],

    initComponent: function() {
	var me = this;

	var stateid = 'pveloginrealm';

	var realmstore = Ext.create('Ext.data.Store', {
	    model: 'pve-domains',
	    autoDestory: true
	});

	Ext.apply(me, {
	    fieldLabel: 'Realm',
	    name: 'realm',
	    store: realmstore,
	    queryMode: 'local',
	    allowBlank: false,
	    forceSelection: true,
	    autoSelect: false,
	    triggerAction: 'all',
	    valueField: 'realm',
	    displayField: 'comment',
	    getState: function() {
		return { value: this.getValue() };
	    },
	    applyState : function(state) {
		if (state && state.value) {
		    this.setValue(state.value);
		}
	    },
	    stateEvents: [ 'select' ],
	    stateful: true,
	    id: stateid, // fixme: remove (Stateful does not work without)  
	    stateID: stateid
	});

        me.callParent();

	realmstore.load({
	    callback: function(r, o, success) {
		if (success) {
		    var def = me.getValue();
		    if (!def || !realmstore.findRecord('realm', def)) {
			if (r[0] && r[0].data)
			    def = r[0].data.realm;
			Ext.each(r, function(record) {
			    if (record.data && record.data["default"]) 
				def = record.data.realm;
			});
		    }
		    if (def)
			me.setValue(def)
		}
	    }
	});
    }
});