Ext.define('PVE.node.SubscriptionKeyEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.apply(me, {
	    title: gettext('Upload Subscription Key'),
	    width: 300,
	    items: {
		xtype: 'textfield',
		name: 'key',
		value: '',
		fieldLabel: gettext('Subscription Key')
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.node.Subscription', {
    extend: 'PVE.grid.ObjectGrid',

    alias: ['widget.pveNodeSubscription'],

    features: [ {ftype: 'selectable'}],

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	var reload = function() {
	    me.rstore.load();
	};

	var baseurl = '/nodes/' + me.nodename + '/subscription';

	var render_status = function(value) {

	    var message = me.getObjectValue('message');

	    if (message) {
		return value + ": " + message;
	    }
	    return value;
	};

	var rows = {
	    productname: {
		header: gettext('Type')
	    },
	    key: {
		header: gettext('Subscription Key')
	    },
	    status: {
		header: gettext('Status'),
		renderer: render_status
	    },
	    message: {
		visible: false
	    },
	    serverid: {
		header: gettext('Server ID')
	    },
	    sockets: {
		header: gettext('Sockets')
	    },
	    checktime: {
		header: gettext('Last checked'),
		renderer: PVE.Utils.render_timestamp
	    }	    
	};

	Ext.applyIf(me, {
	    url: '/api2/json' + baseurl,
	    cwidth1: 170,
	    tbar: [ 
		{
		    text: gettext('Upload Subscription Key'),
		    handler: function() {
			var win = Ext.create('PVE.node.SubscriptionKeyEdit', {
			    url: '/api2/extjs/' + baseurl 
			});
			win.show();
			win.on('destroy', reload);
		    }
		},
		{
		    text: gettext('Check'),
		    handler: function() {
			PVE.Utils.API2Request({
			    params: { force: 1 },
			    url: baseurl,
			    method: 'POST',
			    waitMsgTarget: me,
			    failure: function(response, opts) {
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    },
			    callback: reload
			});
		    }
		}
	    ],
	    rows: rows,
	    listeners: {
		show: reload
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-services', {
	extend: 'Ext.data.Model',
	fields: [ 'service', 'name', 'desc', 'state' ],
	idProperty: 'service'
    });

});
