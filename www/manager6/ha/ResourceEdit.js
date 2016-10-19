Ext.define('PVE.ha.VMResourceInputPanel', {
    extend: 'PVE.panel.InputPanel',

    vmid: undefined,
    
    onGetValues: function(values) {
	var me = this;

	if (me.create) {
	    values.sid = values.vmid;
	}
	
	if (values.group === '') {
	    if (!me.create) {
		values['delete'] = values['delete'] ? ',group' : 'group';
	    }
	    delete values.group;
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

	var disabledHint = Ext.createWidget({
	    xtype: 'displayfield', //submitValue is false, so we don't get submitted
	    userCls: 'pve-hint',
	    value: gettext('Disabling the resource will stop the guest system. ' +
	    'See the online help for details.'),
	    hidden: true
	});

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
		xtype: 'pveHAGroupSelector',
		name: 'group',
		value: '',
		fieldLabel: gettext('Group')
	    },
	    {
		xtype: 'pvecheckbox',
		name: 'enable',
		checked: true,
		uncheckedValue: 0,
		fieldLabel: gettext('enable'),
		listeners: {
		    'change': function(field, newValue) {
			if (newValue === false) {
			    disabledHint.setVisible(true);
			}
			else {
			    if (disabledHint.isVisible()) {
				disabledHint.setVisible(false);
			    }
			}
		    }
		}
	    },
	    disabledHint
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
            me.url = '/api2/extjs/cluster/ha/resources/' + me.vmid;
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

		    values.enable = true;
		    if (values.state === 'disabled') {
			values.enable = false;
		    }

		    var regex =  /^(\S+):(\S+)$/;
		    var res = regex.exec(values.sid);

		    if (res[1] !== 'vm' && res[1] !== 'ct') {
			throw "got unexpected resource type";
		    }

		    values.vmid = res[2];
		    
		    ipanel.setValues(values);
		}
	    });
	}
    }
});
