Ext.define('PVE.form.PrivilegesSelector', {
    extend: 'Proxmox.form.KVComboBox',
    xtype: 'pvePrivilegesSelector',

    multiSelect: true,

    initComponent: function() {
	var me = this;

	// So me.store is available.
	me.callParent();

	Proxmox.Utils.API2Request({
	    url: '/access/roles/Administrator',
	    method: 'GET',
	    success: function(response, options) {
		var data = [], key;
		for (key in response.result.data) {
		    data.push([key, key]);
		}

		me.store.setData(data);

		me.store.sort({
		    property: 'key',
		    direction: 'ASC',
		});
	    },

	    failure: function(response, opts) {
		Ext.Msg.alert(gettext('Error'), response.htmlStatus);
	    },
	});
    },
});
