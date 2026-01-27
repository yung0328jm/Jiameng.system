import { useState, useEffect } from 'react'
import { getRecords, saveRecords, deleteRecord, updateRecord } from '../utils/recordStorage'

function EngineeringRecord({ schedule }) {
  const [records, setRecords] = useState([])
  const [editingRecord, setEditingRecord] = useState(null)
  const [recordForm, setRecordForm] = useState({
    itemNumber: '',
    content: '',
    responsiblePerson: '',
    progress: '',
    remarks: ''
  })

  useEffect(() => {
    if (schedule && schedule.id) {
      loadRecords()
    }
  }, [schedule?.id])

  const loadRecords = () => {
    if (!schedule || !schedule.id) return
    const data = getRecords(schedule.id)
    // 确保至少有6个空记录用于显示
    while (data.length < 6) {
      data.push({
        id: `empty-${data.length}`,
        itemNumber: data.length + 1,
        content: '',
        responsiblePerson: '',
        progress: '',
        remarks: '',
        isEmpty: true
      })
    }
    setRecords(data)
  }


  const handleEditRecord = (record) => {
    if (record.isEmpty) {
      setRecordForm({
        itemNumber: record.itemNumber,
        content: '',
        responsiblePerson: '',
        progress: '',
        remarks: ''
      })
    } else {
      setRecordForm({
        itemNumber: record.itemNumber,
        content: record.content || '',
        responsiblePerson: record.responsiblePerson || '',
        progress: record.progress || '',
        remarks: record.remarks || ''
      })
    }
    setEditingRecord(record.id)
  }

  const handleSaveRecord = () => {
    const existingRecords = getRecords(schedule.id).filter(r => !r.isEmpty)
    const index = existingRecords.findIndex(r => r.id === editingRecord)
    
    if (index !== -1) {
      existingRecords[index] = {
        ...existingRecords[index],
        ...recordForm
      }
    } else {
      existingRecords.push({
        id: editingRecord || Date.now().toString(),
        ...recordForm
      })
    }

    // 重新编号
    existingRecords.forEach((record, idx) => {
      record.itemNumber = idx + 1
    })

    // 确保有6个记录
    while (existingRecords.length < 6) {
      existingRecords.push({
        id: `empty-${existingRecords.length}`,
        itemNumber: existingRecords.length + 1,
        content: '',
        responsiblePerson: '',
        progress: '',
        remarks: '',
        isEmpty: true
      })
    }

    saveRecords(schedule.id, existingRecords)
    setEditingRecord(null)
    setRecordForm({
      itemNumber: '',
      content: '',
      responsiblePerson: '',
      progress: '',
      remarks: ''
    })
    loadRecords()
  }

  const handleDeleteRecord = (recordId) => {
    if (window.confirm('確定要刪除此記錄嗎？')) {
      deleteRecord(schedule.id, recordId)
      loadRecords()
    }
  }

  if (!schedule || !schedule.id) {
    return null
  }

  const participantCount = schedule.participants ? schedule.participants.split(',').length : 0

  return (
    <div className="mt-6 border-t border-gray-700 pt-6">

      {/* 工程紀錄表 */}
      <div className="bg-white text-black rounded-lg overflow-hidden">
        <div className="text-center py-3 bg-gray-100 border-b-2 border-gray-300">
          <h3 className="text-xl font-bold">工程紀錄表</h3>
        </div>

        {/* 表頭 */}
        <div className="grid border-b-2 border-black" style={{ gridTemplateColumns: '80px 1fr 200px' }}>
          <div className="border-r-2 border-black p-2 text-center font-semibold bg-gray-50">項次</div>
          <div className="border-r-2 border-black p-2 text-center font-semibold bg-gray-50">內容</div>
          <div className="p-2 text-center font-semibold bg-gray-50">負責人員</div>
        </div>

        {/* 詳細項目 */}
        {records.slice(0, 6).map((record, index) => (
          <div key={record.id || index} className="grid border-b border-black" style={{ gridTemplateColumns: '80px 1fr 200px' }}>
            <div className="border-r border-black p-2 text-center bg-gray-50 font-semibold">
              {record.itemNumber || index + 1}
            </div>
            <div className="border-r border-black p-1 bg-white min-h-[40px]">
              <input
                type="text"
                value={record.content || ''}
                onChange={(e) => {
                  const allRecords = getRecords(schedule.id)
                  const recordIndex = allRecords.findIndex(r => r.id === record.id)
                  
                  if (recordIndex !== -1) {
                    allRecords[recordIndex] = { 
                      ...allRecords[recordIndex], 
                      content: e.target.value,
                      isEmpty: false
                    }
                  } else {
                    allRecords[index] = {
                      id: record.id || `record-${index}-${Date.now()}`,
                      itemNumber: index + 1,
                      content: e.target.value,
                      responsiblePerson: record.responsiblePerson || '',
                      progress: record.progress || '',
                      remarks: record.remarks || '',
                      isEmpty: false
                    }
                  }
                  
                  // 确保有6个记录
                  while (allRecords.length < 6) {
                    allRecords.push({
                      id: `empty-${allRecords.length}`,
                      itemNumber: allRecords.length + 1,
                      content: '',
                      responsiblePerson: '',
                      progress: '',
                      remarks: '',
                      isEmpty: true
                    })
                  }
                  
                  saveRecords(schedule.id, allRecords)
                  loadRecords()
                }}
                className="w-full border-0 bg-transparent px-2 py-1 focus:outline-none focus:bg-yellow-50 rounded"
                placeholder=""
              />
            </div>
            <div className="p-1 bg-white">
              <input
                type="text"
                value={record.responsiblePerson || ''}
                onChange={(e) => {
                  const allRecords = getRecords(schedule.id)
                  const recordIndex = allRecords.findIndex(r => r.id === record.id)
                  
                  if (recordIndex !== -1) {
                    allRecords[recordIndex] = { 
                      ...allRecords[recordIndex], 
                      responsiblePerson: e.target.value,
                      isEmpty: false
                    }
                  } else {
                    allRecords[index] = {
                      id: record.id || `record-${index}-${Date.now()}`,
                      itemNumber: index + 1,
                      content: record.content || '',
                      responsiblePerson: e.target.value,
                      progress: record.progress || '',
                      remarks: record.remarks || '',
                      isEmpty: false
                    }
                  }
                  
                  // 确保有6个记录
                  while (allRecords.length < 6) {
                    allRecords.push({
                      id: `empty-${allRecords.length}`,
                      itemNumber: allRecords.length + 1,
                      content: '',
                      responsiblePerson: '',
                      progress: '',
                      remarks: '',
                      isEmpty: true
                    })
                  }
                  
                  saveRecords(schedule.id, allRecords)
                  loadRecords()
                }}
                className="w-full border-0 bg-transparent px-2 py-1 focus:outline-none focus:bg-yellow-50 rounded"
                placeholder=""
              />
            </div>
          </div>
        ))}

        {/* 各項目進度 */}
        <div className="grid border-b-2 border-black" style={{ gridTemplateColumns: '80px 1fr' }}>
          <div className="border-r-2 border-black p-2 bg-gray-50 font-semibold text-center" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>各項目進度</div>
          <div>
            {records.slice(0, 6).map((record, index) => (
              <div key={`progress-${record.id || index}`} className="grid border-b border-black" style={{ gridTemplateColumns: '80px 1fr' }}>
                <div className="border-r border-black p-2 text-center bg-gray-50 font-semibold">
                  {record.itemNumber || index + 1}
                </div>
                <div className="p-1 bg-white min-h-[60px]">
                  <textarea
                    value={record.progress || ''}
                    onChange={(e) => {
                      const allRecords = getRecords(schedule.id)
                      const recordIndex = allRecords.findIndex(r => r.id === record.id)
                      
                      if (recordIndex !== -1) {
                        allRecords[recordIndex] = { 
                          ...allRecords[recordIndex], 
                          progress: e.target.value,
                          isEmpty: false
                        }
                      } else {
                        allRecords[index] = {
                          id: record.id || `record-${index}-${Date.now()}`,
                          itemNumber: index + 1,
                          content: record.content || '',
                          responsiblePerson: record.responsiblePerson || '',
                          progress: e.target.value,
                          remarks: record.remarks || '',
                          isEmpty: false
                        }
                      }
                      
                      // 确保有6个记录
                      while (allRecords.length < 6) {
                        allRecords.push({
                          id: `empty-${allRecords.length}`,
                          itemNumber: allRecords.length + 1,
                          content: '',
                          responsiblePerson: '',
                          progress: '',
                          remarks: '',
                          isEmpty: true
                        })
                      }
                      
                      saveRecords(schedule.id, allRecords)
                      loadRecords()
                    }}
                    className="w-full border-0 bg-transparent px-2 py-1 focus:outline-none focus:bg-yellow-50 rounded min-h-[60px] resize-none"
                    placeholder=""
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 備註 */}
        <div className="grid border-b-2 border-green-500" style={{ gridTemplateColumns: '80px 1fr' }}>
          <div className="border-r-2 border-black p-2 bg-gray-50 font-semibold text-center" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>備註</div>
          <div className="p-1 bg-white min-h-[80px]">
            <textarea
              value={records.find(r => r.remarks && !r.isEmpty)?.remarks || records[0]?.remarks || ''}
              onChange={(e) => {
                const allRecords = getRecords(schedule.id)
                const recordWithRemarks = allRecords.find(r => r.remarks !== undefined && r.remarks !== '' && !r.isEmpty)
                
                if (recordWithRemarks) {
                  const recordIndex = allRecords.findIndex(r => r.id === recordWithRemarks.id)
                  allRecords[recordIndex] = { ...allRecords[recordIndex], remarks: e.target.value }
                } else if (allRecords.length > 0) {
                  allRecords[0] = { 
                    ...allRecords[0], 
                    remarks: e.target.value,
                    isEmpty: false
                  }
                } else {
                  allRecords.push({
                    id: Date.now().toString(),
                    itemNumber: 1,
                    content: '',
                    responsiblePerson: '',
                    progress: '',
                    remarks: e.target.value,
                    isEmpty: false
                  })
                }
                
                // 确保有6个记录
                while (allRecords.length < 6) {
                  allRecords.push({
                    id: `empty-${allRecords.length}`,
                    itemNumber: allRecords.length + 1,
                    content: '',
                    responsiblePerson: '',
                    progress: '',
                    remarks: '',
                    isEmpty: true
                  })
                }
                
                saveRecords(schedule.id, allRecords)
                loadRecords()
              }}
              className="w-full border-0 bg-transparent px-2 py-1 focus:outline-none focus:bg-yellow-50 rounded min-h-[80px] resize-none"
              placeholder=""
            />
          </div>
        </div>
        
        {/* 保存和返回按钮 */}
        <div className="mt-4 flex justify-end space-x-3">
          <button
            onClick={() => {
              // 保存所有数据
              const allRecords = getRecords(schedule.id)
              saveRecords(schedule.id, allRecords)
              alert('保存成功！')
            }}
            className="bg-yellow-400 text-black font-semibold px-6 py-2 rounded-lg hover:bg-yellow-500 transition-colors"
          >
            保存
          </button>
          <button
            onClick={() => {
              // 返回工程排程列表
              window.location.href = '/engineering-schedule'
            }}
            className="bg-gray-700 text-white font-semibold px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
          >
            返回
          </button>
        </div>
      </div>
    </div>
  )
}

export default EngineeringRecord
