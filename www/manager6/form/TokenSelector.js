Ext.define('PVE.form.TokenSelector', {
    extend: 'Proxmox.form.ComboGrid',
    alias: ['widget.pveTokenSelector'],

    allowBlank: false,
    autoSelect: false,
    valueField: 'id',
    displayField: 'id',

    editable: true,
    anyMatch: true,
    forceSelection: true,

    initComponent: function() {
	var me = this;

	var store = new Ext.data.Store({
	    model: 'pve-tokens',
	    sorters: [{
		property: 'userid'
	    },
	    {
		property: 'tokenid'
	    }]
	});

	Ext.apply(me, {
	    store: store,
            listConfig: {
		columns: [
		    {
			header: gettext('API Token'),
			sortable: true,
			dataIndex: 'id',
			flex: 1
		    },
		    {
			header: gettext('Comment'),
			sortable: false,
			dataIndex: 'comment',
			renderer: Ext.String.htmlEncode,
			flex: 1
		    }
		]
	    }
	});

	me.callParent();

	Proxmox.Utils.API2Request({
	    url: '/access/users/?full=1',
	    method: 'GET',
	    failure: function(response, opts) {
		Proxmox.Utils.setErrorMask(me, response.htmlStatus);
		me.load_task.delay(me.load_delay);
	    },
	    success: function(response, opts) {
		Proxmox.Utils.setErrorMask(me, false);
		var result = Ext.decode(response.responseText);
		var data = result.data || [];
		var records = [];
		Ext.Array.each(data, function(user) {
		    tokens = user.tokens || [];
		    Ext.Array.each(tokens, function(token) {
			var r = {};
			r.id = user.userid + '!' + token.tokenid;
			r.comment = token.comment;
			records.push(r);
		    });
		});
		store.loadData(records);
	    },
	});
    }

}, function() {

    Ext.define('pve-tokens', {
	extend: 'Ext.data.Model',
	fields: [
	    'id', 'userid', 'tokenid', 'comment',
	    { type: 'boolean', name: 'privsep' },
	    { type: 'date', dateFormat: 'timestamp', name: 'expire' }
	],
	idProperty: 'id'
    });

});



