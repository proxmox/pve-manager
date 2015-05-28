Ext.define('PVE.form.RealmComboBox', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.pveRealmComboBox'],

    needOTP: function(realm) {
	var me = this;

	var rec = me.store.findRecord('realm', realm);

	return rec && rec.data && rec.data.tfa ? rec.data.tfa : undefined;
    },

    initComponent: function() {
	var me = this;

	var stateid = 'pveloginrealm';

	var realmstore = Ext.create('Ext.data.Store', {
	    model: 'pve-domains',
	});

	Ext.apply(me, {
	    fieldLabel: gettext('Realm'),
	    name: 'realm',
	    store: realmstore,
	    queryMode: 'local',
	    allowBlank: false,
	    forceSelection: true,
	    autoSelect: false,
	    triggerAction: 'all',
	    valueField: 'realm',
	    displayField: 'descr',
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
			def = 'pam';
			Ext.each(r, function(record) {
			    if (record.data && record.data["default"]) { 
				def = record.data.realm;
			    }
			});
		    }
		    if (def) {
			me.setValue(def);
		    }
		}
	    }
	});
    }
});
