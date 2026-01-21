import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Alert,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { studentAPI } from '../services/api';

function StudentList() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    ma_sv: '',
    ho_ten: '',
    ngay_sinh: '',
    gioi_tinh: 'Nam',
    lop: '',
    khoa: '',
    email: '',
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    const filtered = students.filter(student =>
      student.ho_ten.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.ma_sv.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lop?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredStudents(filtered);
    setPage(0);
  }, [searchTerm, students]);

  const fetchStudents = async () => {
    try {
      const response = await studentAPI.getAll();
      setStudents(response.data);
      setFilteredStudents(response.data);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Không thể tải danh sách sinh viên');
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleOpenDialog = () => {
    setFormData({
      ma_sv: '',
      ho_ten: '',
      ngay_sinh: '',
      gioi_tinh: 'Nam',
      lop: '',
      khoa: '',
      email: '',
    });
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setError(null);
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async () => {
    try {
      await studentAPI.create(formData);
      setSuccess('Thêm sinh viên thành công!');
      setOpenDialog(false);
      fetchStudents();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Có lỗi xảy ra khi thêm sinh viên');
    }
  };

  const handleViewStudent = (maSV) => {
    navigate(`/students/${maSV}`);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          Danh sách Sinh viên
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenDialog}
        >
          Thêm sinh viên
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Tìm kiếm theo tên, mã SV, lớp..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Mã SV</TableCell>
                  <TableCell>Họ và tên</TableCell>
                  <TableCell>Ngày sinh</TableCell>
                  <TableCell>Giới tính</TableCell>
                  <TableCell>Lớp</TableCell>
                  <TableCell>Khoa</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="right">Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStudents
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((student) => (
                    <TableRow key={student.ma_sv} hover>
                      <TableCell>{student.ma_sv}</TableCell>
                      <TableCell>
                        <Typography fontWeight={500}>{student.ho_ten}</Typography>
                      </TableCell>
                      <TableCell>
                        {student.ngay_sinh
                          ? new Date(student.ngay_sinh).toLocaleDateString('vi-VN')
                          : '-'}
                      </TableCell>
                      <TableCell>{student.gioi_tinh || '-'}</TableCell>
                      <TableCell>{student.lop || '-'}</TableCell>
                      <TableCell>{student.khoa || '-'}</TableCell>
                      <TableCell>
                        <Chip
                          label={student.trang_thai || 'Đang học'}
                          color={student.trang_thai === 'Đang học' ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleViewStudent(student.ma_sv)}
                        >
                          <ViewIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={filteredStudents.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Số dòng mỗi trang:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} của ${count}`}
          />
        </CardContent>
      </Card>

      {/* Dialog thêm sinh viên */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Thêm sinh viên mới</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Mã sinh viên"
                name="ma_sv"
                value={formData.ma_sv}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Họ và tên"
                name="ho_ten"
                value={formData.ho_ten}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ngày sinh"
                name="ngay_sinh"
                type="date"
                value={formData.ngay_sinh}
                onChange={handleInputChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Giới tính"
                name="gioi_tinh"
                value={formData.gioi_tinh}
                onChange={handleInputChange}
                SelectProps={{ native: true }}
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Lớp"
                name="lop"
                value={formData.lop}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Khoa"
                name="khoa"
                value={formData.khoa}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Hủy</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            Thêm sinh viên
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StudentList;