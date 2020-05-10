Ext.define('PVE.panel.SDNControllerBase', {
    extend: 'Proxmox.panel.InputPanel',

    type: '',

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = me.type;
	} else {
	    delete values.controller;
	}

	return values;
    },
});

Ext.define('PVE.sdn.controllers.BaseEdit', {
    extend: 'Proxmox.window.Edit',

    initComponent : function() {
	var me = this;

	me.isCreate = !me.controllerid;

	if (me.isCreate) {
	    me.url = '/api2/extjs/cluster/sdn/controllers';
	    me.method = 'POST';
	} else {
	    me.url = '/api2/extjs/cluster/sdn/controllers/' + me.controllerid;
	    me.method = 'PUT';
	}

	var ipanel = Ext.create(me.paneltype, {
	    type: me.type,
	    isCreate: me.isCreate,
	    controllerid: me.controllerid
	});

	Ext.apply(me, {
	    subject: PVE.Utils.format_sdncontroller_type(me.type),
	    isAdd: true,
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;
		    var ctypes = values.content || '';

		    values.content = ctypes.split(',');

		    if (values.nodes) {
			values.nodes = values.nodes.split(',');
		    }
		    values.enable = values.disable ? 0 : 1;

		    ipanel.setValues(values);
		}
	    });
	}
    }
});
