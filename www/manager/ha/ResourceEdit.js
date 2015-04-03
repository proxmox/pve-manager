Ext.define('PVE.ha.VMResourceInputPanel', {
    extend: 'PVE.panel.InputPanel',

    // only usable to type 'vm'
    
    vmid: undefined,
    
    onGetValues: function(values) {
	var me = this;

	if (me.create) {
	    values.type = 'vm';
	    values.sid = values.vmid;
	    delete values['delete']; // ignore
	}

	delete values.vmid;

	if (values.enable) {
	    values.state = 'enabled';
	} else {
	    values.state = 'disabled';
	}
	delete values.enable;
	
	return values;
    },

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: me.vmid ? 'displayfield' : 'pveVMIDSelector',
		name: 'vmid',
		fieldLabel: 'VM ID',
		value: me.vmid,
		loadNextFreeVMID: false,
		validateExists: true
	    }
	];

	me.column2 = [
	    {
		xtype: 'pvetextfield', // fixme: group selector
		name: 'group',
		value: '',
		deleteEmpty: true,
		fieldLabel: gettext('Group')
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'enable',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('enable')
	    }
	];

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    }
	];
	
	me.callParent();
    }
});

Ext.define('PVE.ha.VMResourceEdit', {
    extend: 'PVE.window.Edit',

    vmid: undefined,

    initComponent : function() {
	var me = this;
 
	me.create = !me.vmid;

	if (me.create) {
            me.url = '/api2/extjs/cluster/ha/resources';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/cluster/ha/resources/vm:' + me.vmid;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.ha.VMResourceInputPanel', {
	    create: me.create,
	    vmid: me.vmid
	});

	Ext.apply(me, {
            subject: gettext('VM Resource'),
	    isAdd: true,
	    items: [ ipanel ]
	});
	
	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;

		    values.enable = false;
		    if (values.state === 'enabled') {
			values.enable = true;
		    }

		    var regex =  /^(\S+):(\S+)$/;
		    var res = regex.exec(values.sid);

		    if (res[1] !== 'vm') { throw "got unexpected resource type"; };

		    values.vmid = res[2];
		    
		    ipanel.setValues(values);
		}
	    });
	}
    }
});
