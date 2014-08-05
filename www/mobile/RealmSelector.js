Ext.define('PVE.form.RealmSelector', {
    extend: 'Ext.field.Select',
    alias: ['widget.pveRealmSelector'],

    config: {
	autoSelect: false,
	valueField: 'realm',
	displayField: 'descr',
	store: { model: 'pve-domains' },
 	value: 'pam'
    },

    needOTP: function(realm) {
	var me = this;

	var realmstore = me.getStore();

	var rec = realmstore.findRecord('realm', realm);

	return rec && rec.data && rec.data.tfa ? rec.data.tfa : undefined;
    },

    initialize: function() {
	var me = this;

	me.callParent();
	
	var realmstore = me.getStore();

	realmstore.load({
	    callback: function(r, o, success) {
		if (success) {
		    var def = me.getValue();
		    if (!def || !realmstore.findRecord('realm', def)) {
			def = 'pam';
			Ext.each(r, function(record) {
			    if (record.get('default')) { 
				def = record.get('realm');
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
